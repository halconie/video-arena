# syntax=docker/dockerfile:1
FROM oven/bun:1 AS base
WORKDIR /app

# Prune the monorepo down to just what `web` needs.
FROM base AS prepare
RUN bun install -g turbo@^2
COPY . .
RUN turbo prune web --docker

FROM base AS builder
COPY --from=prepare /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=prepare /app/out/full/ .

# Vite bakes VITE_* vars into the bundle at build time.
ARG VITE_BACKEND_URL=http://localhost:4000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN bun run --filter=web build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
