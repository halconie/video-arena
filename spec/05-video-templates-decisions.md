# 05 - Video templates: decisions & what got built

Companion to `04-video-templates.md` (the ask), following `01` and `03`.
Records the decisions, what got added, and the gotchas.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| **What an "avatar" is** | 1-2 stored face images in MinIO - no training step | There's no face-model training in the stack, but FaceFusion is already wired up and blocks already call for face swap on start/end frames. The avatar is simply the swap *source*. Confirmed with the user before building |
| **Render execution** | Synchronous request, but **every block persisted as it completes** | User chose synchronous to stay consistent with the rest of the app. Measured here, one 5s generation is 60-120s, so an 8-block template is 10-20+ min against a **5-minute default `requestTimeout`** - a plain synchronous render would be killed mid-flight and lose blocks that cost real money. So: `server.requestTimeout = 0`, plus a `RenderedBlock` row per block so a re-POST resumes instead of regenerating |
| **Resume key** | `RenderedBlock @@unique([renderId, blockId])` | The renderer skips any block that already has a `COMPLETED` row for that render. Makes a dropped connection cost nothing |
| **Admin role** | `User.role` + better-auth `additionalFields` with `input: false` | `input: false` is load-bearing - without it a user could pass `role: "admin"` to sign-up and promote themselves. Verified this is actually blocked (see below). Seeded from `ADMIN_EMAILS` via a `databaseHooks.user.create.before` hook |
| **Stitching** | ffmpeg in the backend image, re-encoding rather than stream-copy concat | Clips come from different models/resolutions. `concat` with stream copy silently produces broken output unless every input shares codec/resolution/timebase, so each clip is normalised (scale + pad + fps) before concatenation |
| **Per-block audio** | Forced `generateAudio: false` on block generations | The template lays its own audio track over the whole video, so per-block audio would just be mixed away - and several models charge extra for it |
| **Thumbnails** | Extracted from the finished video with ffmpeg | Template thumbnail comes from the admin's preview render; each user render gets its own thumbnail. Both required by the spec |
| **Export gating** | Export requires a successful preview first | The preview is what produces the thumbnail and proves the template actually renders, so publishing without one would ship a broken/thumbnail-less template to users |
| **Timeline UI** | Custom component, not a library | Nothing in the existing shadcn set does timelines, and the spec explicitly wants a Premiere-like feel: fixed track headers + scrollable lanes, time ruler with adaptive tick spacing, zoom (px-per-second), draggable playhead, drag-to-move and edge-drag-to-resize clips snapped to whole seconds |

## What got built

**Data model** - `Avatar`, `Template`, `VideoBlock`, `TemplateRender`,
`RenderedBlock`, `TemplateStatus` enum, `User.role`; one migration.

**Backend**
- `lib/ffmpeg.ts` - `concatVideos`, `muxAudio`, `extractThumbnail`.
- `lib/render.ts` - the resumable pipeline shared by admin previews and user
  renders: per block → optional face swap of start/end frames against the
  slot's avatar → `generateVideo` → upload → persist `RenderedBlock`; then
  concat → mux audio → thumbnail.
- `routes/avatars.ts` (`/api/avatars`), `routes/templates.ts`
  (`/api/templates`, admin CRUD behind `requireAdmin` + user browse/render).
- `middleware/auth.ts` gains `requireAdmin`; `index.ts` disables the request
  timeout.

**Frontend**
- `/user/avatar` - create/list/delete avatars.
- `/user/templates` - browse exported templates, pick avatar(s) per slot,
  render, and see your own rendered videos.
- `/admin/template/create` - the timeline builder + per-block editor panel
  (prompt, model, resolution, aspect ratio, start/end frames, face-swap
  toggles, avatar slot) + preview/export.
- Navbar gains Avatar and Templates; Admin appears only for `role === "admin"`.

## Gotchas

- **MinIO URLs aren't fetchable from inside the backend.** Stored URLs use
  `MINIO_PUBLIC_URL` (`http://localhost:9000`) so the *browser* can load
  them, but that doesn't resolve inside the container - the backend reaches
  MinIO at `minio:9000`. The render pipeline has to re-download stored
  frames/clips, so `minio.ts` gained `downloadStoredUrl()` which rewrites
  public → internal before fetching. Easy to miss until a render fails.
- **`z.coerce.boolean("false")` is `true`** - the same trap already hit with
  the video route's `generateAudio`. Blocks are multipart (they carry frame
  images), so their booleans arrive as strings; `swapStartFrame`/
  `swapEndFrame` use the explicit `"true"/"false"` preprocess instead.
- **Express 5 types route params as `string | string[]`**, which Prisma
  `update`/`delete` (needing exactly `string`) reject - hence `String(req.params.id)`
  at those call sites.
- **Prisma's boolean type is `Boolean`, not `Bool`** - trivial, but it fails
  validation rather than being auto-corrected.
- Concat deliberately re-encodes; on a long template this is the slowest
  non-generation step. If it ever becomes a bottleneck, the fix is to force
  every block to one resolution/fps at generation time so stream-copy concat
  becomes safe - not to blindly switch to `-c copy`.

## Verified end-to-end

Live generation is billed per clip, so the test template was kept
deliberately tiny - **2 blocks x 2s**, cheapest model, ~$0.30 for the whole
verification pass including the two headshots.

- Admin bootstrap: `ADMIN_EMAILS` promotes on sign-up (`role: admin`), a
  normal signup gets `role: user`, non-admins get **403** from admin routes,
  and passing `role: "admin"` to sign-up does **not** promote.
- ffmpeg 7.1.5 present in the rebuilt backend image.
- Avatar created via the API from a generated headshot.
- A 2-block template (one plain block, one with face swap on its start
  frame) plus an uploaded audio track, **preview-rendered end to end in
  4m16s**. `ffprobe` on the result: h264 1280x720 + **aac** audio stream,
  duration exactly `4.000000`s (= 2 x 2s blocks concatenated, template audio
  muxed). Thumbnail is a real extracted frame.
- Mid-render, block 1 was observed sitting `COMPLETED` with its `outputUrl`
  while block 2 was still generating - the per-block persistence that makes
  resume work.
- **Resume, verified for free**: re-POSTing with the existing `renderId`
  logged `already done, skipping` for both blocks and finished in **1
  second** instead of 4m16s, making zero OpenRouter calls. A dropped
  connection genuinely does not re-bill.
- Export flips the template to `EXPORTED` and it becomes visible to a normal
  (non-admin) user.
- User-render guards reject an avatar the caller doesn't own
  (`Unknown avatar`) and a wrong avatar count, **before** any generation -
  confirmed by no new `template_render` row being created.
- SPA routes `/user/avatar`, `/user/templates`, `/admin/template/create` all
  served through nginx.
- `bun run lint` / `check-types` / `build` clean across the workspace.

**Not verified:** a full user render by a non-admin (as opposed to an admin
preview). It's the same `renderTemplate` code path, differing only in which
row is written and the ownership checks above, but it would have cost
another full render so it was skipped deliberately.
