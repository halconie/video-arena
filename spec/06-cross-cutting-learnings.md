# 06 - Cross-cutting learnings

`01`, `03` and `05` record decisions per feature. This one is the synthesis:
the patterns, recurring failure modes, and operational realities that span
the whole project. Written for whoever (human or agent) picks this up next.

---

## 1. The single most valuable habit: verify against the running thing, not the docs

Four times in this project the documentation was wrong, incomplete, or
silently mismatched with the installed version. Every one was caught by
running the real artifact and reading the real output. Every one would have
shipped as a confusing runtime bug otherwise.

| What | What the docs said | What was actually true |
| --- | --- | --- |
| better-auth Prisma schema | `@better-auth/cli generate` emits the correct `Account` model | It omitted `issuer`, which the 1.7.1 **runtime writes on every account creation**. Sign-up 500'd until the column was added by hand |
| FaceFusion CLI | published docs don't spell out `headless-run`'s flags; a doc-answering tool guessed `--source-paths/--target-path` | Real flags are `-s` / `-t` / `-o` with `--processors face_swapper`. Confirmed by running `--help` inside the pinned image |
| OpenRouter image models | (assumed same shape as video models) | Video models carry `pricing_skus` inline; **image models don't** - pricing sits behind each model's `endpoints` URL |
| OpenRouter list responses | (assumed a bare array) | Returns `{ data: [...] }`. The first frontend model-picker silently fell back to a hardcoded list forever because `Array.isArray(response)` was false |

**Rule of thumb:** if a claim about an external dependency can be checked by
running one command against the pinned version, run it. `--help`, a `curl`
against the real endpoint, or a throwaway container costs seconds and
removes a whole class of "plausible but wrong" code.

A corollary that paid off repeatedly: **prove a fix with the failing case
before declaring it fixed.** The base64 frame fix, the resume path, and the
admin self-promotion guard were each tested against the exact scenario that
would break them.

---

## 2. Recurring bug classes (expect these again)

### 2a. Multipart booleans

Hit **twice** - `generateAudio` on videos, then `swapStartFrame` /
`swapEndFrame` on template blocks.

Any route that accepts file uploads is `multipart/form-data`, so *every*
field arrives as a string. `z.coerce.boolean()` follows JS truthiness, so
the string `"false"` becomes `true`. Silent, and it inverts behaviour.

```ts
// wrong on multipart routes
flag: z.coerce.boolean()
// right - see multipartBoolean in routes/templates.ts
z.preprocess(v => v === "false" ? false : v === "true" ? true : v, z.boolean())
```

### 2b. A URL is only valid from where it was minted

Bit us **twice, in opposite directions**:

- **Outbound:** MinIO URLs are built from `MINIO_PUBLIC_URL`
  (`http://localhost:9000`) so browsers can load them. OpenRouter rejects
  them outright - *"Localhost URLs are not allowed"* - so every image-guided
  generation 502'd. Fix: send frames **inline as base64 data URIs**.
- **Inbound:** those same public URLs don't resolve *inside* the backend
  container either (it reaches MinIO at `minio:9000`). The render pipeline
  has to re-read stored frames, hence `downloadStoredUrl()`, which rewrites
  public → internal before fetching.

**Ask of any URL: who is going to dereference this - a browser, our server,
or a third party?** They need different hostnames.

### 2c. One timeout serving two different questions

The first face-swap implementation used a single 3-minute deadline for both
"is FaceFusion even running?" and "is this swap just slow?". The first real
cold-start run took **2m48s** and cleared it by 12 seconds - on a slower
connection it would have reported a misleading *"is it running?"* while
FaceFusion was working perfectly.

Fix: two deadlines, distinguished by a signal the worker actually emits
(it deletes the `pending` marker when it claims a job) - 20s to be *claimed*,
15 min to *finish*. The same shape was then reused for template renders.

**Generalisation:** when one timeout covers both "nothing is listening" and
"this is slow", find a signal that separates them. Otherwise it's either too
impatient for the slow path or too slow to report the dead one.

### 2d. Express 5 route param types

`req.params.id` types as `string | string[]`, which Prisma `update`/`delete`
reject. `String(req.params.id)` at those call sites.

---

## 3. Architectural through-lines

### Synchronous, but never lose paid work

Every generation endpoint is synchronous - the user's explicit preference,
and consistent across the app. That's fine for a single clip (60-120s), but
a template is 10-20+ minutes against a **5-minute default `requestTimeout`**
that would kill it mid-flight and burn every clip already paid for.

The resolution keeps the simple API *and* the durability:

1. `server.requestTimeout = 0` so normal renders aren't killed.
2. A `RenderedBlock` row per block, written **the moment that block
   completes**.
3. `renderTemplate()` skips any block already `COMPLETED` for that render.

Verified for free: re-POSTing a finished render logged `already done,
skipping` for every block and completed in **1 second instead of 4m16s**,
with zero OpenRouter calls.

**If you later move to a job queue, keep `RenderedBlock`** - it's the part
that makes work non-repeatable, independent of how it's scheduled.

### Shared-volume IPC for CLI-only tools

FaceFusion has no REST API. Two tempting options were rejected: mounting the
Docker socket into the backend (hands it broad control of the host daemon)
and driving FaceFusion's internal Gradio endpoints (undocumented, breaks
across versions).

What's there instead: a shared volume as a job queue. The backend writes
inputs + a `pending` marker; the container runs a bash watcher loop
(a `command:` override - no custom image); the backend polls for a `status`
file. Ordering matters - **the marker is written last**, after the inputs are
fully on disk, so a job can't be claimed half-written.

This generalises to any CLI-only tool you want to reach from the backend.

### Extract first, then build on it

Before adding image generation and face swap, the shared pieces were pulled
out of the video route (`requireAuth`, `upload`, `uploadFile`, and on the
frontend `RequireSession`, `StatusBadge`). Templates then reused all of it
and added `requireAdmin` and `downloadStoredUrl`.

Result: three feature routes with the same shape - create row `PENDING` →
upload inputs to MinIO for display → generate → upload output → `COMPLETED`;
on error log, mark `FAILED`, return 502 **with the row** so the frontend can
show `errorMessage`. Follow that shape for anything new.

---

## 4. Cost: the constraint that shapes testing

Every generation is billed. Real numbers observed here:

| Model | Price | Note |
| --- | --- | --- |
| `kwaivgi/kling-v3.0-std` | $0.084/s silent, **$0.126/s with audio** | a 5s clip billed **$0.63** - audio defaults on and nearly doubles it |
| `alibaba/wan-3.0` | $0.05 / $0.10 / $0.20 per s @ 480p/720p/1080p | flat, easy to budget |
| `microsoft/mai-image-2.6` | ~$0.039/image | |
| `bytedance/seedance-2.0-mini` | token-priced | **can't be predicted before running** |
| FaceFusion swap | free | local compute; ~13s warm, first run downloads ~400MB |

Practical rules:
- **Prefer flat per-second models** over token-priced ones when budgeting.
- **`generateAudio: false` is the biggest single cost lever** on video. Block
  renders force it off, since the template's own audio track replaces it.
- **Look for the free path first.** Resume, export, and the ownership/count
  guards were all verified at **$0** - resume by re-running a completed
  render (skips every block), guards by checking that a rejected request
  creates no render row at all.
- Keep test templates tiny. The whole template verification was 2 blocks x
  2s (~$0.30). Total project spend ≈ **$2**.

Samples of every generation, with model/settings/pricing, are in
`generated-samples/` (gitignored, ~32MB).

---

## 5. Security posture

- **`role` is server-owned.** Declared to better-auth with `input: false`,
  which is exactly what stops `role: "admin"` in a sign-up body from
  promoting the caller. **Verified**: that request returns `role: user`. If
  the auth schema is ever regenerated, confirm that flag survives.
- `requireAdmin` mounts **after** `requireAuth` (it reads `req.userRole`).
  Route order in `routes/templates.ts` is deliberate: user-facing routes are
  registered *before* `router.use(requireAdmin)`.
- Ownership is checked, not assumed - a user cannot render with an avatar
  they don't own (verified: `Unknown avatar`, no render row created).
- Secrets: real `.env` files are gitignored; `.env.example` holds
  placeholders only. The staged diff was scanned for key patterns before
  committing. **Note:** real keys were once pasted into `.env.example` (which
  is *not* ignored) and caught before commit - worth a glance whenever that
  file changes.

---

## 6. Known gaps / where to look next

Honest list of what is *not* done or not proven:

- **A full user render (non-admin) was never executed.** Same
  `renderTemplate` path as the admin preview, differing only in which row is
  written plus the ownership guards (which *were* tested) - but it would
  have cost another render, so it was skipped deliberately.
- **No job queue.** Renders hold an HTTP connection for tens of minutes.
  Fine for a prototype; not for real users. `RenderedBlock` already makes
  the work resumable, so the migration is mostly scheduling.
- **No block-level progress in the UI.** The timeline can display per-block
  status (`blockStatus` prop exists) but nothing feeds it during a render -
  the user just waits. Cheap win once polling exists.
- **Timeline blocks can overlap.** They snap to whole seconds and clamp to
  the template duration, but nothing prevents two blocks occupying the same
  span; render order is by `startSeconds`.
- **Concat always re-encodes** to 1280x720/30fps. Correct, but the slowest
  non-generation step. If it becomes a bottleneck, normalise at *generation*
  time so stream-copy concat becomes safe - don't just switch to `-c copy`,
  which silently produces broken output on mismatched inputs.
- **FaceFusion is amd64-only**; on Apple Silicon it runs emulated.
- **`.gitignore` contains `.env.example`**, which is misleading - the file is
  already tracked, and gitignore only affects *untracked* files, so it has
  no effect. Flagged repeatedly, still there.
- Admin promotion for a pre-existing account needs a **SQL update** -
  `ADMIN_EMAILS` only fires in the `user.create` hook, so it won't
  retroactively promote anyone who signed up earlier.

---

## 7. Operational notes

- `docker compose up` deliberately **skips FaceFusion** (large image + ~400MB
  weights). Face swap and any face-swapped template block need
  `docker compose --profile facefusion up -d facefusion`.
- New env vars must be added to **three** places or things break quietly:
  `turbo.json`'s `globalEnv` (or `lint` fails on `--max-warnings 0`), the
  relevant `.env.example`, and `docker-compose.yml`.
- `bun run lint && bun run check-types && bun run build` from the root is the
  gate; all three must be clean.
- Schema changes: edit `schema.prisma` → `prisma format` → `prisma validate`
  → `db:migrate`. Prisma's boolean type is `Boolean`, not `Bool`.
- The backend image carries **ffmpeg** (7.1.5) for stitching/muxing/thumbnails.
