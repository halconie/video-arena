# 03 - Image generation & face swap: decisions & what got built

Companion to `02-implement-image-and-faceswap.md` (the ask), in the same
spirit as `01-initial-video-app.md`. Records the decisions made while
implementing it, what got added, and the gotchas found along the way.

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Image generation transport | Single synchronous `POST /api/v1/images` call, no polling | Unlike the video API, OpenRouter's image API returns the finished image in the response body (base64) - there's no job/poll cycle to hide |
| Reference images -> OpenRouter | Inline base64 data URIs, same as video frames | OpenRouter rejects localhost/private URLs; the image API takes `input_references` in the identical `{type:"image_url", image_url:{url}}` shape and explicitly accepts data URLs. Reference images are *also* uploaded to MinIO, purely so they show in the user's history |
| Status enum | New `GenerationStatus` (PENDING/PROCESSING/COMPLETED/FAILED) for `Image`/`FaceSwap`, leaving `VideoStatus` alone | Same four values, but reusing `VideoStatus` for non-video models would be confusing and would entangle Video's existing migration history for no benefit |
| **FaceFusion transport** | **Shared Docker volume as a job queue** | FaceFusion has no REST API - it's a CLI/Gradio tool. Considered and rejected: (a) mounting the Docker socket into the backend so it could `docker exec` - hands the backend broad control of the host's Docker daemon; (b) driving FaceFusion's internal Gradio HTTP endpoints - undocumented and fragile across versions. The volume approach needs no custom image (just a `command:` override) and mirrors the existing video-generation poll loop conceptually |
| FaceFusion default state | Stays opt-in behind the `facefusion` compose profile | User's explicit choice. It's a large image and pulls ~400MB of model weights on first swap; people who only want video/image generation shouldn't pay that on `docker compose up` |
| Face-swap timeouts | **Two** deadlines: 20s to be *claimed*, then 15 min to *finish* | A single timeout can't serve both cases. The watcher deletes the `pending` marker the moment it claims a job, which cleanly separates "nothing is running" (fail fast, name the command to start it) from "this is just slow" (first swap downloads ~400MB of weights). Found this the hard way - see gotchas |
| Code reuse (spec's explicit ask) | Extracted shared modules rather than duplicating per feature | See table below |

## Extracted for reuse

The spec asked to "keep the endpoints/code re-usable as much as possible."
Rather than copy-pasting the video route three times, the shared pieces were
pulled out first (behavior-preserving refactor of `routes/videos.ts`), then
reused:

| Concern | Module |
| --- | --- |
| Auth-gating a route | `apps/backend/src/middleware/auth.ts` (`requireAuth`) |
| Multer upload config | `apps/backend/src/lib/uploads.ts` (`upload`) |
| Uploading a multer file | `apps/backend/src/lib/minio.ts` (`uploadFile`) |
| OpenRouter auth/data-URI helpers | `apps/backend/src/lib/openrouter.ts` (`headers`, `apiKey`, `toDataUri`) |
| Auth-gating a page | `apps/web/src/components/require-session.tsx` |
| Status pill | `apps/web/src/components/status-badge.tsx` |

All three feature routes now follow one shape: create row `PENDING` → upload
inputs to MinIO → run generation → upload output → `COMPLETED`; on error,
log, mark `FAILED`, return 502 with the row.

## What got built

**Image generation**
- `Image` model + migration; `listImageModels()` / `generateImage()` in
  `openrouter.ts`; `routes/images.ts` (`GET /models`, `GET /`, `GET /:id`,
  `POST /`) at `/api/images`.
- Frontend: `create-image-form.tsx`, `image-list.tsx`, `image-page.tsx`
  (tabs: Text to image / Your images), route `/image`.

**Face swap**
- `FaceSwap` model + migration; `lib/faceswap.ts` (job writer + poller);
  `routes/faceswap.ts` at `/api/faceswap`.
- `docker-compose.yml`: shared `faceswap_jobs` volume mounted into both
  `backend` (`FACESWAP_JOBS_DIR=/jobs`) and `facefusion`; the latter's
  `command:` is a bash watcher loop.
- Frontend: `create-faceswap-form.tsx`, `faceswap-list.tsx`,
  `faceswap-page.tsx` (tabs: Swap a face / Your face swaps), route
  `/face-swap`.

**Navbar** gained Image and Face Swap tabs (now `NavLink`-based so the
active tab is highlighted).

## Gotchas / notes

- **FaceFusion's `-s` / `-t` are easy to get backwards.** Verified against
  the real image rather than guessed (the published docs don't spell out
  `headless-run`'s flags): `-s` is the *face being applied*, `-t` is the
  *base image it's applied to*, `-o` the output, and the processor is
  `--processors face_swapper`. Confirmed by running `headless-run --help`
  inside `facefusion/facefusion:3.8.2-cpu`.
- **The FaceFusion image is amd64-only.** On Apple Silicon it runs under
  emulation. It works, but expect a warning on every start and slower runs
  (~13s per swap once weights are cached; the *first* swap also downloads
  ~400MB of models).
- **`$` must be escaped as `$$` in the compose `command:` block**, or
  Compose tries to interpolate the shell variables at config-parse time.
  Verified with `docker compose config` that the resolved script is right.
- **The `pending` marker is written last**, after both images are fully on
  disk, so the watcher can't pick up a half-written job. It doubles as the
  "has anything claimed this?" signal for the two-deadline logic below.
- **A single face-swap timeout was the wrong design, caught during live
  testing.** The first version used one flat 3-minute deadline. In the very
  first real run against a freshly-started FaceFusion, the model download
  was only ~43% done at the 2m10s mark - it finished with well under a
  minute to spare. On a slower connection that same request would have
  timed out and reported a misleading "is it running?" error while
  FaceFusion was in fact working fine. Split into `CLAIM_TIMEOUT_MS` (20s,
  detects "nothing is watching") and `RUN_TIMEOUT_MS` (15 min, allows for a
  cold start).
- Both containers run as root, so there's no uid mismatch on the shared
  volume. Worth re-checking if either image ever starts running as a
  non-root user.
- Image-model pricing isn't in `GET /images/models` - it's behind each
  model's `endpoints` URL (`/api/v1/images/models/<id>/endpoints`), unlike
  video models which include `pricing_skus` inline.

## Verified end-to-end

Against the live Docker stack, not just typechecked:

- `bun run lint` / `check-types` / `build` clean across the workspace.
- Image generation through `POST /api/images` returned real images
  (`microsoft/mai-image-2.6`, ~$0.04 each) that landed in MinIO.
- Face swap with FaceFusion **stopped**: failed after exactly 3m00s with
  `Timed out waiting for FaceFusion - is it running? Start it with: docker
  compose --profile facefusion up -d facefusion`, and the job directory on
  the shared volume was confirmed to contain `source.png`, `target.png`,
  `pending`.
- Face swap with FaceFusion **running**: watcher logged
  `processing /jobs/<id>` and produced a real swapped image.
