# Video Arena

A generative media SaaS with three features:

- **Video generation** - prompt, duration, resolution, aspect ratio, audio
  on/off, optional start/end/reference frames, via
  [OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/video-generation).
- **Image generation** - prompt, resolution, aspect ratio, optional reference
  images, via
  [OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/image-generation).
- **Face swap** - upload a base image and a face, get the face swapped in,
  via a self-hosted [FaceFusion](https://docs.facefusion.io/) container.
- **Templates** - long-form (5-10 min) video. No model generates that
  coherently in one shot, so an admin lays out short **video blocks** on a
  Premiere-style timeline over one audio track; each block is generated
  separately (optionally with the user's face swapped onto its start/end
  frames) and the results are stitched together with ffmpeg. Users pick a
  template, supply their **avatar**, and regenerate it as themselves.

## Architecture

| Service     | What                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `apps/web`      | React + Vite + Tailwind + shadcn/ui frontend                      |
| `apps/backend`  | Express + TypeScript API (auth, video/image/face-swap, OpenRouter, MinIO) |
| `packages/db`   | Prisma schema/client, shared by the backend                       |
| Postgres    | primary datastore                                                      |
| MinIO       | S3-compatible object store for uploads + generated media               |
| FaceFusion  | self-hosted face swap, opt-in via the `facefusion` compose profile     |

Auth is handled by [better-auth](https://www.better-auth.com/) (email+password
and Google OAuth), talking to Postgres through `packages/db`'s Prisma client.

## Prerequisites

- [Bun](https://bun.sh) 1.4+
- [Docker](https://www.docker.com/) + Docker Compose (for Postgres/MinIO/FaceFusion, or the full stack)

## Quick start (everything in Docker)

```sh
cp .env.example .env
# fill in BETTER_AUTH_SECRET (openssl rand -base64 32), and later
# GOOGLE_CLIENT_ID/SECRET + OPENROUTER_API_KEY when you have them

bun run docker:up
```

This builds and starts Postgres, MinIO, the backend (running migrations on
boot), and the frontend.

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- MinIO console: http://localhost:9001 (login with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

**FaceFusion is not started by default** - it's a large image and pulls
model weights on first run, so it's kept opt-in for people who only want
video/image generation. The face-swap feature needs it, so start it with:

```sh
docker compose --profile facefusion up -d facefusion
```

Face swaps submitted while it's stopped fail after ~20 seconds with a message
telling you to run that command. The first swap after starting it is slow (it
downloads ~400MB of model weights); subsequent ones take seconds on CPU.

Stop everything with `bun run docker:down`, or `bun run docker:reset` to also
wipe the Postgres/MinIO volumes.

## Local development (apps on the host, infra in Docker)

Faster iteration loop: run just Postgres + MinIO in Docker, and the apps
directly with Bun.

```sh
cp .env.example .env               # for docker compose (postgres/minio creds)
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

docker compose up -d postgres minio

bun install
bun run db:migrate                 # creates the Postgres schema
bun run dev                        # runs both apps via turbo
```

- Frontend dev server: http://localhost:5173
- Backend dev server: http://localhost:4000 (auto-reloads via `bun --watch`)

## Environment variables

See `.env.example` (Docker Compose) and the per-app `.env.example` files for
the full list. Notably:

- `BETTER_AUTH_SECRET` - required. Generate with `openssl rand -base64 32`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - optional until you set up
  Google sign-in; leave blank otherwise.
- `OPENROUTER_API_KEY` - required for video/image generation to work; the
  app runs fine without it, generation requests will just fail. (Face swap
  doesn't need it - that runs locally on FaceFusion.)
- `ADMIN_EMAILS` - comma-separated emails promoted to `admin` on sign-up.
  Admins get `/admin/template/create`, the template builder. The role is
  server-owned, so it can't be self-assigned at sign-up.
- `FACESWAP_JOBS_DIR` - where the backend and the FaceFusion container
  exchange face-swap jobs. Set automatically in `docker-compose.yml`; only
  relevant if you run the backend outside Docker.

**Note:** images you attach to a generation request (video frames, image
reference images) are sent to OpenRouter inline as base64, *not* as MinIO
URLs - OpenRouter rejects localhost/private URLs. They're still uploaded to
MinIO so they show up in your history. `MINIO_PUBLIC_URL` only needs to be
reachable by your *browser*, not by OpenRouter.

## Useful commands

```sh
bun run dev            # run all apps (turbo)
bun run build           # build all apps
bun run lint             # lint all apps
bun run check-types      # typecheck all apps
bun run db:migrate       # create/apply a Prisma migration
bun run db:studio        # open Prisma Studio
```

## API

All endpoints require an authenticated session (better-auth cookie).

| Endpoint | What |
| --- | --- |
| `GET /api/avatars` · `POST /api/avatars` · `DELETE /api/avatars/:id` | your avatars (1-2 face images each) |
| `GET /api/templates` | exported templates |
| `GET /api/templates/renders` | your template renders |
| `POST /api/templates/:id/render` | generate a template with your avatar(s). Long-running; pass `renderId` to resume |
| `GET /api/templates/admin/all` *(admin)* | all templates incl. drafts |
| `POST`/`PATCH`/`DELETE /api/templates/:id` *(admin)* | template CRUD |
| `POST /api/templates/:id/audio` *(admin)* | set the base audio track |
| `POST`/`PATCH`/`DELETE /api/templates/:id/blocks[/:blockId]` *(admin)* | timeline blocks |
| `POST /api/templates/:id/preview` *(admin)* | render with the admin's avatar; supplies the thumbnail |
| `POST /api/templates/:id/export` *(admin)* | publish to users (needs a successful preview) |
| `GET /api/videos` · `GET /api/videos/:id` | your videos |
| `GET /api/videos/models` | video models available via OpenRouter |
| `POST /api/videos` | generate a video (multipart: `prompt`, `model`, `duration`, `resolution`, `aspectRatio`, `generateAudio`, optional `startFrame`/`endFrame`/`referenceFrames`) |
| `GET /api/images` · `GET /api/images/:id` | your images |
| `GET /api/images/models` | image models available via OpenRouter |
| `POST /api/images` | generate an image (multipart: `prompt`, `model`, `resolution`, `aspectRatio`, optional `referenceImages`) |
| `GET /api/faceswap` · `GET /api/faceswap/:id` | your face swaps |
| `POST /api/faceswap` | swap a face (multipart: `baseImage`, `faceImage`) |

Generation endpoints are synchronous - they hold the request open until the
result is ready, then return the finished row. On failure they return 502
with the row, whose `errorMessage` explains what went wrong.

## Project structure

```
apps/
  web/        - React frontend (Vite)
  backend/    - Express API
packages/
  db/                 - Prisma schema + client (@repo/db)
  eslint-config/      - shared ESLint config
  typescript-config/  - shared tsconfig bases
docker-compose.yml    - Postgres, MinIO, backend, web, FaceFusion (opt-in)
```
