# syntax=docker/dockerfile:1
FROM oven/bun:1 AS base
WORKDIR /app

# Prune the monorepo down to just what `backend` needs (itself + @repo/db,
# @repo/eslint-config, @repo/typescript-config) using turbo's docker helper.
FROM base AS prepare
RUN bun install -g turbo@^2
COPY . .
RUN turbo prune backend --docker

# Install deps first (cached unless package.json/lockfile/schema change).
# @repo/db's postinstall runs `prisma generate`, which needs the schema
# file present, so pull that in ahead of the rest of the source.
FROM base AS builder
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/full/packages/db/prisma packages/db/prisma
RUN bun install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
RUN bun run --filter=@repo/db db:generate

FROM base AS runner
WORKDIR /app
COPY --from=builder /app .
WORKDIR /app/apps/backend

EXPOSE 4000
CMD ["bun", "src/index.ts"]
