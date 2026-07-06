# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
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
