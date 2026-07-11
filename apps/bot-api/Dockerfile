# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
# EPIC 8 live-verification pass discovered this: node:22-alpine has no
# `openssl` package installed, so Prisma's own OpenSSL-version detection
# (both at `prisma generate` time in the `build` stage below, AND again at
# runtime in the `runner` stage — it's a live check, not baked into the
# generated client) can't run and silently falls back to guessing
# "openssl-1.1.x", which doesn't exist as a loadable library on modern
# Alpine (libssl.so.1.1 was dropped in favor of libssl.so.3) — the container
# then crash-loops with "Error loading shared library libssl.so.1.1: No
# such file or directory" on its very first Prisma query. Installing the
# real `openssl` package fixes detection at both points (so "native" in
# packages/db/prisma/schema.prisma's binaryTargets correctly resolves to
# the openssl-3.0.x engine that actually matches this image), which is why
# this line lives in `base` — every later stage (deps/build/runner) derives
# from it.
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
# pnpm install --frozen-lockfile checks the lockfile against every workspace
# member's manifest, so all of them must be present even though this image
# only ends up building apps/bot-api and its own dependencies.
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/bot-api/package.json apps/bot-api/package.json
COPY apps/web-miniapp/package.json apps/web-miniapp/package.json
COPY apps/web-admin/package.json apps/web-admin/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/bot-api apps/bot-api
RUN pnpm --filter @ashena/shared... --filter @ashena/db... --filter @ashena/bot-api... run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/bot-api
EXPOSE 3000
# docker-compose overrides `command` to `node dist/worker.js` for the worker service.
CMD ["node", "dist/index.js"]
