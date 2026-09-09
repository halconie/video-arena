# AGENTS.md

Instructions for coding agents working in this repo. See `README.md` for
user-facing setup docs.

## What this is

A generative media SaaS (Turborepo, Bun workspaces) - video generation,
image generation, and face swap:

- `apps/web` - React + Vite + Tailwind + shadcn/ui frontend
- `apps/backend` - Express + TypeScript API: better-auth (email/password +
  Google), video/image/face-swap CRUD, OpenRouter generation, MinIO uploads
- `packages/db` - Prisma schema/client (`@repo/db`), imported by the backend
- `packages/eslint-config`, `packages/typescript-config` - shared configs

**Shared building blocks** - reuse these rather than re-rolling them when
adding a feature:

| Concern | Use |
| --- | --- |
| Auth-gating a route | `apps/backend/src/middleware/auth.ts` (`requireAuth`, sets `req.userId`) |
| Accepting file uploads | `apps/backend/src/lib/uploads.ts` (`upload`, multer memory storage) |
| Storing a file | `apps/backend/src/lib/minio.ts` (`uploadFile` for multer files, `uploadObject` for buffers) |
| Calling OpenRouter | `apps/backend/src/lib/openrouter.ts` (shared `headers`/`apiKey`/`toDataUri`) |
| Auth-gating a page | `apps/web/src/components/require-session.tsx` (`RequireSession`) |
| Status pill in a list | `apps/web/src/components/status-badge.tsx` (`StatusBadge`) |
| Admin-only route | `requireAdmin` in `apps/backend/src/middleware/auth.ts` (mount **after** `requireAuth`) |
| Re-fetching something we stored in MinIO | `downloadStoredUrl` in `apps/backend/src/lib/minio.ts` - **not** plain `fetch` |
| Video stitching / audio / thumbnails | `apps/backend/src/lib/ffmpeg.ts` |

The three feature routes (`routes/videos.ts`, `routes/images.ts`,
`routes/faceswap.ts`) all follow the same shape: create the row `PENDING`,
upload inputs to MinIO for display, run the generation, upload the output,
mark `COMPLETED` - or catch, log, mark `FAILED` and return 502 with the row.
Follow that shape for any new generation feature.

## Commands

Run from the repo root unless noted.

```sh
bun install               # install all workspace deps
bun run dev                # run web + backend via turbo
bun run build                # build all apps
bun run lint                  # eslint, all apps (--max-warnings 0)
bun run check-types            # tsc --noEmit, all apps
bun run db:migrate              # prisma migrate dev (packages/db)
bun run db:generate               # regenerate the Prisma client after schema.prisma changes
docker compose up -d postgres minio   # just the infra, for local `bun run dev`
bun run docker:up                       # full stack in Docker (builds images)
```

Before committing backend changes, run `bun run lint && bun run check-types`
(or `bun run build`) from the repo root - both apps must pass with zero
warnings.

## Key facts / gotchas

- **Auth is better-auth, not hand-rolled.** `apps/backend/src/lib/auth.ts`
  defines the `betterAuth()` instance; it's mounted at `/api/auth/*` in
  `apps/backend/src/index.ts` *before* `express.json()` (better-auth parses
  its own request body - do not move `express.json()` above it).
- **The Prisma schema (`packages/db/prisma/schema.prisma`) has two parts:**
  the app's own models (`Video`, ...) and the `User`/`Session`/`Account`/
  `Verification` tables better-auth owns. If you change auth config in a way
  that needs new columns (e.g. enabling a new social provider that needs an
  extra field), regenerate the auth tables rather than hand-editing them:
  ```sh
  cd apps/backend
  bunx @better-auth/cli generate --config src/lib/auth.ts --output ../../packages/db/prisma/schema.prisma -y
  ```
  Then re-check the diff - it rewrites the whole file, so re-add the `Video`
  relation/fields if it drops them (see git history of that file for the
  pattern), and run `bun run db:generate` + `bun run db:migrate` after.
- **New env vars must be added to `turbo.json`'s `globalEnv`**, or
  `eslint-plugin-turbo` will warn on `process.env.X` usage and `lint` will
  fail (`--max-warnings 0`). Also add them to the relevant `.env.example`
  file(s) (root for docker-compose, `apps/backend/.env.example` for local
  dev).
- **OpenRouter's video API is async** (submit job -> poll `polling_url` ->
  `unsigned_urls[0]`) even though the backend's `POST /api/videos` exposes it
  as one synchronous call - `apps/backend/src/lib/openrouter.ts` does the
  polling internally. See the comment there before changing the flow to
  something webhook/queue-based.
- **MinIO must be publicly reachable for OpenRouter to work end-to-end**
  (it needs to fetch frame images and to serve the video URL is fetched
  from). Locally this only works if you tunnel MinIO (e.g. ngrok) or deploy
  it somewhere public - `MINIO_PUBLIC_URL` is what gets embedded in URLs
  handed to OpenRouter and to the frontend.
- **Face swap talks to FaceFusion over a shared Docker volume, not HTTP.**
  FaceFusion has no REST API (it's a CLI/Gradio tool), so
  `apps/backend/src/lib/faceswap.ts` writes images + a `pending` marker
  into `FACESWAP_JOBS_DIR`, and the `facefusion` service's `command:` in
  `docker-compose.yml` is a bash loop that picks jobs up, runs
  `facefusion.py headless-run ... --processors face_swapper`, and writes a
  `status` file back. Both ends share the `faceswap_jobs` volume. If you
  change the job protocol, change both ends together.
  - Verified CLI flags (from `headless-run --help` on the pinned image):
    `-s` = the face being applied, `-t` = the base image it's applied to,
    `-o` = output. Easy to get backwards.
  - It stays behind the `facefusion` compose profile (large image + ~400MB
    of model weights on first run), so `docker compose up` skips it.
  - `faceswap.ts` has **two** deadlines, not one, and the distinction
    matters: the watcher deletes the `pending` marker the instant it claims
    a job, so if that marker still exists after `CLAIM_TIMEOUT_MS` (20s)
    nothing is running → fail fast with "start it with…". Once claimed, the
    much longer `RUN_TIMEOUT_MS` (15 min) applies, because the first swap
    downloads model weights. Don't collapse these back into one timeout -
    a single value is either too impatient for a cold start or too slow to
    report that FaceFusion is simply down.
  - The published image is amd64-only; on Apple Silicon it runs under
    emulation (slow but works - ~13s per swap once models are cached).
- **Stored MinIO URLs are not fetchable from inside the backend.** They're
  built from `MINIO_PUBLIC_URL` (`http://localhost:9000`) so the *browser*
  can load them; the backend reaches MinIO at `minio:9000`. Always use
  `downloadStoredUrl()` (which rewrites public → internal) when the server
  needs to read something back, e.g. in the render pipeline.
- **Template renders are synchronous but resumable.** `lib/render.ts` writes
  a `RenderedBlock` row per block and skips any that's already `COMPLETED`
  for that render, so re-POSTing with `renderId` resumes instead of
  re-paying OpenRouter. `index.ts` sets `server.requestTimeout = 0` because
  the 5-minute default would kill a real render mid-flight. Don't "simplify"
  either of these away - a 10-block template is 10-20+ minutes of generation.
- **Admin role is server-owned.** `User.role` is declared to better-auth
  with `input: false`, which is what stops a user passing `role: "admin"` to
  sign-up. If you ever re-run the better-auth schema generator, make sure
  that flag survives.
- Blocks are multipart (they carry frame images), so their booleans arrive as
  strings - use the `multipartBoolean` preprocess in `routes/templates.ts`,
  not `z.coerce.boolean()` (which turns `"false"` into `true`).
- Dockerfiles use `turbo prune <app> --docker` to build a minimal image per
  app; if you add a new workspace package that `backend` or `web` depends
  on, no Dockerfile changes should be needed (prune follows the dependency
  graph automatically) - but do rebuild (`docker compose build`) to confirm.
