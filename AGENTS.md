# AGENTS.md

Instructions for coding agents working in this repo. See `README.md` for
user-facing setup docs.

## What this is

A video generation SaaS (Turborepo, Bun workspaces):

- `apps/web` - React + Vite + Tailwind + shadcn/ui frontend
- `apps/backend` - Express + TypeScript API: better-auth (email/password +
  Google), video CRUD, OpenRouter video generation, MinIO uploads
- `packages/db` - Prisma schema/client (`@repo/db`), imported by the backend
- `packages/eslint-config`, `packages/typescript-config` - shared configs

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
- **FaceFusion is in `docker-compose.yml` but not wired into the app.** It's
  behind the `facefusion` compose profile so it doesn't start by default.
  Don't build against it yet without checking with the user first.
- Dockerfiles use `turbo prune <app> --docker` to build a minimal image per
  app; if you add a new workspace package that `backend` or `web` depends
  on, no Dockerfile changes should be needed (prune follows the dependency
  graph automatically) - but do rebuild (`docker compose build`) to confirm.
