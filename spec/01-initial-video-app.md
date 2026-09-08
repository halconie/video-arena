# 01 - Decisions & what got built

Companion to `00-inital-video-app.md`. That file is the original ask; this
one is a record of the decisions made while implementing it, what actually
got added, and the gotchas hit along the way. Written after Steps 1 and 2
were built, Dockerized, and smoke-tested against a live stack.

## Stack decisions

| Area | Decision | Why |
| --- | --- | --- |
| Package manager / JS runtime | Bun everywhere (frontend, backend, scripts, Docker images) | Spec asked for it for the frontend; used it uniformly instead of mixing in Node, since Bun runs TS directly and Express/Vite/Prisma all work fine on it |
| Node version manager | fnm | Not part of the app itself, but installed alongside Bun on the host so a real Node is available if ever needed |
| Frontend framework | React + Vite (`bun create vite`, `react-ts` template), not Next.js | Spec explicitly asked for "a react frontend", and the app is a pure client (talks to a separate Express API) with no need for SSR |
| Frontend styling | Tailwind CSS v4 + shadcn/ui (`radix` base, `nova` preset) | User's explicit choice over plain CSS/CSS modules |
| Frontend routing | react-router-dom | Only two routes today (`/`, `/login`), but the navbar/auth-modal/page split wanted real routing rather than hand-rolled state |
| Backend framework | Express 5 + TypeScript, ESM (`"type": "module"`) | Spec asked for "TypeScript + Express" explicitly |
| Auth | **better-auth**, not hand-rolled JWT/Passport | User's explicit choice (asked for it by name mid-planning). Handles email+password and Google OAuth, owns its own Prisma tables, exposes a React client with reactive `useSession()` |
| Auth session transport | better-auth's own cookie-based sessions (httpOnly, `SameSite=Lax`) | Default better-auth behavior; no custom JWT logic was written |
| ORM / DB | Prisma **6.x** (not 7) + Postgres | Prisma 7 requires driver adapters and a new `prisma.config.ts`/generated-client-path setup; pinned to the last 6.x (`6.19.x`) to keep the classic `@prisma/client` import and avoid unrelated churn while wiring up better-auth's adapter |
| DB package boundary | All Prisma schema/client logic lives in `packages/db` (`@repo/db`), imported by `apps/backend` | Matches the spec's explicit ask to keep this in a separate reusable package |
| Object storage | MinIO via `@aws-sdk/client-s3` (S3-compatible API), not the `minio` npm package | Keeps the dependency on a standard, well-known SDK instead of a MinIO-specific client; MinIO speaks S3 natively so this just works with `forcePathStyle: true` |
| Video generation API | OpenRouter's `/api/v1/videos` (create-job + poll `polling_url` until `completed`/`failed`) | Only real option per spec; the API itself is async, so `apps/backend/src/lib/openrouter.ts` hides the polling loop behind one function so `POST /api/videos` can stay synchronous per the spec ("talk to openrouter synchronously for now") |
| Face swap | FaceFusion added to `docker-compose.yml` only, gated behind `--profile facefusion` (not started by default, not wired into any app code) | Spec: "We will need this later not right now but let's add it to the docker compose" |
| Monorepo tool | Turborepo (already scaffolded before this spec), Bun workspaces | Pre-existing from repo setup |
| Docker build strategy | `turbo prune <app> --docker` per app, multi-stage Dockerfiles | Turborepo's own recommended pattern for shipping one app out of a monorepo without dragging in unrelated workspace packages |
| Frontend serving in Docker | Static build (`vite build`) served by `nginx:alpine`, with SPA fallback (`try_files ... /index.html`) for client-side routing | Standard, lightweight production pattern for a Vite SPA; avoids needing Bun/Node in the runtime image |
| Backend serving in Docker | `bun src/index.ts` directly (no `tsc` compile step in the image) | Bun runs TS natively; skips an extra build stage. (`apps/backend`'s `build` script with `tsc` still exists and is used by `turbo run build`/CI as a type-check-as-build signal, just not by the Docker image) |

## What got built

### Step 1 - infrastructure

- `packages/db` - `schema.prisma` with the app's own `Video` model
  (prompt, model, duration, resolution, aspectRatio, start/end/reference
  frame URLs, status enum, output URL, error message) plus better-auth's
  `User`/`Session`/`Account`/`Verification` tables (generated via
  `@better-auth/cli generate`, not hand-written - see "Gotchas" below for
  where that needed a manual fix). Exported `prisma` singleton client.
- `apps/backend` -
  - `src/lib/auth.ts` - `betterAuth()` instance: `prismaAdapter`, email+password
    enabled, Google social provider, `trustedOrigins` set to the frontend origin.
  - `src/index.ts` - Express app. `better-auth`'s handler mounted at
    `/api/auth/*` **before** `express.json()` (it parses its own body).
    CORS configured with `credentials: true` against `WEB_ORIGIN`. Calls
    `ensureBucket()` on boot before listening.
  - `src/lib/minio.ts` - S3 client pointed at MinIO, `uploadObject()`
    helper, `ensureBucket()` that creates the bucket and attaches a
    public-read policy on `s3:GetObject` if it doesn't already exist (so
    generated videos/uploaded frames are servable straight to the browser
    without presigned URLs).
  - `src/lib/openrouter.ts` - `generateVideo()` (create job, poll until
    done/failed/timeout - 10 minute timeout, 3s poll interval),
    `downloadVideo()`, `listVideoModels()` (proxies OpenRouter's
    `/videos/models` endpoint for the frontend's model picker).
  - `src/routes/videos.ts` - all routes behind a `requireAuth` middleware
    (via `auth.api.getSession`). `GET /models`, `GET /`, `GET /:id`,
    `POST /` (multipart: prompt/model/duration/resolution/aspectRatio +
    optional startFrame/endFrame/referenceFrames files -> uploads any
    provided frames to MinIO -> calls OpenRouter -> uploads the result to
    MinIO -> persists the `Video` row, `PENDING` -> `PROCESSING` ->
    `COMPLETED`/`FAILED`).
- `apps/web` - Vite + React + Tailwind v4 + shadcn/ui scaffold, `@/*` path
  alias, `better-auth/react` client (`src/lib/auth-client.ts`), typed fetch
  wrapper for the video API (`src/lib/api.ts`).
- `docker-compose.yml` - `postgres`, `minio`, `backend` (runs
  `prisma migrate deploy` then starts), `web`, `facefusion` (opt-in
  profile). Named volumes for Postgres/MinIO/FaceFusion data.
- `apps/backend/Dockerfile`, `apps/web/Dockerfile` - see the stack
  decisions table above; both use `turbo prune`.
- `.env.example` at the repo root (for `docker-compose.yml`) and in each of
  `apps/backend`, `apps/web`, `packages/db` (for host-side local dev).
- `README.md` (user-facing setup) and `AGENTS.md` (agent-facing gotchas/
  commands) written/updated.
- Root `package.json` scripts: `db:generate`, `db:migrate`, `db:studio`,
  `docker:up`, `docker:down`, `docker:reset`.
- Removed the default create-turbo `apps/web`/`apps/docs`/`packages/ui`
  Next.js starter content (and the now-dead `packages/eslint-config/next.js`
  + `packages/typescript-config/nextjs.json`) since none of it applied once
  the frontend became a Vite app instead of Next.js.

### Step 2 - features

- **Navbar** - single "Video" tab, sign-in button (opens the auth modal) or
  an avatar/dropdown (name, email, sign out) depending on session state.
- **Login page** (`/login`) and **auth modal** - both render the same
  `AuthForm` component (Google button + email/password sign-in/sign-up
  toggle) to avoid duplicating the form logic; the modal is what the navbar
  actually opens, the page is a standalone route for direct links or as the
  logged-out state of the video page.
- **Video page** (`/`) - shadcn `Tabs`: "Text to video" (the generation
  form - model select populated from `GET /api/videos/models` with a
  hardcoded fallback list if that call fails, e.g. no `OPENROUTER_API_KEY`
  yet; duration/resolution/aspect-ratio selects; optional start/end/
  reference frame file inputs) and "Your videos" (grid of the signed-in
  user's videos, each card showing the prompt, status badge, and either the
  playable `<video>` once `COMPLETED` or the error message if `FAILED`).

## Known limitations / not done

- **MinIO must be publicly reachable for real generation to work
  end-to-end.** OpenRouter's servers need to fetch uploaded frame URLs and
  the app needs to download the finished video from OpenRouter - locally,
  `MINIO_PUBLIC_URL` only resolves to `localhost`, which OpenRouter can't
  reach. Fine for local UI/API testing without frames; real frame-guided
  generation needs MinIO on a public URL (tunnel or real deployment).
- **FaceFusion is not wired into any app code.** It's in
  `docker-compose.yml` behind a profile so the stack doesn't pull/start it
  by default. No face-swap endpoint or UI exists yet.
- **No pricing UI**, per spec ("No need to show any pricing right now").
- **No email verification / password reset flow** - better-auth supports
  both, but the spec only asked for basic email+password and Google, so
  neither was turned on.
- **No background job queue.** Generation happens inline in the request
  handler (per spec: "talk to openrouter synchronously for now"), so a
  slow/long generation holds the HTTP connection open for however long
  OpenRouter takes (up to the 10-minute timeout in `openrouter.ts`). Worth
  moving to a queue (and polling from the frontend) before this goes to
  real users.

## Gotchas hit while building this (fixed, but worth knowing)

- **`turbo prune --docker` + Prisma `postinstall` ordering.** The pruned
  install layer (`out/json/`) only contains `package.json` files, not
  `prisma/schema.prisma`, but `@repo/db`'s `postinstall` script
  (`prisma generate`) needs that file to exist. Fixed by copying just
  `packages/db/prisma` into the builder stage before `bun install`, ahead
  of the full source copy - see `apps/backend/Dockerfile`.
- **better-auth's Prisma adapter schema mismatch.** `@better-auth/cli
  generate` (run against `apps/backend/src/lib/auth.ts`) produced an
  `Account` model *without* an `issuer` column, but the installed
  better-auth runtime (1.7.1) writes `issuer: "local:credential"` on every
  account creation - so sign-up 500'd with `Unknown argument 'issuer'`
  until the column was added by hand and a migration created. If you
  regenerate the auth schema in the future, diff it against the current
  `Account` model before overwriting - the CLI's output isn't guaranteed
  to match what the same-version runtime actually needs.
- **No migrations existed until the stack was actually run against a real
  Postgres.** `prisma generate` (client generation) doesn't need a live DB
  and was run repeatedly during development, but `prisma migrate dev`
  does - so the first `docker compose up` had a fully working backend
  process talking to a Postgres with zero tables. Migrations were created
  once Docker + Postgres were available (`packages/db/prisma/migrations/`).
- **OpenRouter's video-models response shape.** `GET /videos/models`
  returns `{ data: [...] }`, not a bare array - the frontend's first draft
  of the model picker checked `Array.isArray(response)` and silently kept
  the fallback model list forever. Fixed in
  `apps/web/src/components/create-video-form.tsx`.
