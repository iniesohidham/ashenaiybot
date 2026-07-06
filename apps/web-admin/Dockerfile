# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
# pnpm install --frozen-lockfile checks the lockfile against every workspace
# member's manifest, so all of them must be present even though this image
# only ends up building apps/web-admin and its own dependencies.
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/bot-api/package.json apps/bot-api/package.json
COPY apps/web-miniapp/package.json apps/web-miniapp/package.json
COPY apps/web-admin/package.json apps/web-admin/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web-admin apps/web-admin
RUN pnpm --filter @ashena/shared... --filter @ashena/web-admin... run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3002
# Standalone server binds to `localhost` unless HOSTNAME is set — that would
# make it unreachable from outside the container.
ENV HOSTNAME=0.0.0.0
WORKDIR /repo
COPY --from=build /repo/apps/web-admin/.next/standalone ./
COPY --from=build /repo/apps/web-admin/.next/static ./apps/web-admin/.next/static
COPY --from=build /repo/apps/web-admin/public ./apps/web-admin/public
EXPOSE 3002
CMD ["node", "apps/web-admin/server.js"]
