# Video Arena

A video generation SaaS: users describe a video (prompt, duration, resolution,
aspect ratio, optional start/end/reference frames) and it gets generated via
[OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/video-generation).

## Architecture

| Service     | What                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `apps/web`      | React + Vite + Tailwind + shadcn/ui frontend                      |
| `apps/backend`  | Express + TypeScript API (auth, video CRUD, OpenRouter, MinIO)    |
| `packages/db`   | Prisma schema/client, shared by the backend                       |
| Postgres    | primary datastore                                                      |
| MinIO       | S3-compatible object store for uploaded frames + generated videos      |
| FaceFusion  | self-hosted face swap - in `docker-compose.yml`, not wired into the app yet |

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

FaceFusion is not started by default (it's not used yet). Bring it up with:

```sh
docker compose --profile facefusion up
```

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
- `OPENROUTER_API_KEY` - required for actual video generation to work; the
  app runs fine without it, generation requests will just fail.

**Note:** OpenRouter needs to fetch your start/end/reference frame images by
URL, and needs to be reachable to fetch the finished video back. Locally,
MinIO is only reachable at `localhost`, which OpenRouter's servers can't
reach - so real end-to-end generation only works once MinIO (or wherever
`MINIO_PUBLIC_URL` points) is on a publicly reachable URL.

## Useful commands

```sh
bun run dev            # run all apps (turbo)
bun run build           # build all apps
bun run lint             # lint all apps
bun run check-types      # typecheck all apps
bun run db:migrate       # create/apply a Prisma migration
bun run db:studio        # open Prisma Studio
```

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
