# Ashenaiy (@ashenaiybot)

Telegram bot for anonymous chat with strangers, with a simplified Tinder-like profile/swipe/match layer. See `ashenaiybot-prd-and-backlog.md` for the full product spec and backlog, and `CLAUDE.md` for architecture notes.

## Monorepo layout

- `apps/bot-api` — Node.js/TypeScript backend: grammY bot + Fastify REST API + BullMQ worker.
- `apps/web-miniapp` — Next.js Telegram Mini App.
- `apps/web-admin` — Next.js Admin Panel.
- `packages/db` — Prisma schema and generated client, shared by backend apps.
- `packages/shared` — Zod schemas/types and small utilities shared across apps.

## Prerequisites

- Node.js >= 22
- pnpm (run `corepack enable` once, then pnpm resolves automatically via `packageManager`)
- Docker + Docker Compose (for Postgres/Redis and full-stack runs)

## Install

```bash
pnpm install
```

## Configure environment

```bash
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN and any other blank values
```

`apps/bot-api` validates required environment variables at startup with Zod and exits with a clear error if anything required is missing — see `.env.example` for the full list with descriptions.

## Run locally (without Docker)

Postgres and Redis still need to be running somewhere reachable at `DATABASE_URL`/`REDIS_URL`. Easiest path is to start just those two via Docker:

```bash
docker compose -f docker-compose.dev.yml up postgres redis -d
pnpm run build:packages   # builds packages/db (incl. prisma generate) and packages/shared
pnpm run db:migrate       # applies migrations to your local Postgres
pnpm dev
```

This starts `bot-api` (API + bot, with hot reload), `web-miniapp`, and `web-admin` in parallel. Re-run `pnpm run build:packages` after editing `packages/db` or `packages/shared` while apps are running via Docker Compose dev (their `tsc --watch` `dev` script keeps `dist/` fresh automatically when run through `pnpm dev` instead).

## Run the full stack with Docker Compose

```bash
# local development, with hot reload
docker compose -f docker-compose.dev.yml up

# production-like build
docker compose up --build
```

Both compose files bring up `postgres`, `redis`, `nginx`, `api` (bot-api), `worker`, `web-miniapp`, and `web-admin`.

## Common scripts (run from repo root)

```bash
pnpm build            # build every app/package
pnpm build:packages   # build just packages/db and packages/shared (apps depend on their dist/ output)
pnpm typecheck        # typecheck every app/package (builds packages first)
pnpm lint             # lint the whole repo
pnpm test             # run all unit tests (vitest)
pnpm db:migrate       # apply Prisma migrations to your local Postgres
pnpm db:seed          # populate sample users/matches/reports (see US-1.2)
```

## Health check

Once `bot-api` is running: `GET /health` returns `200 {"status":"ok","db":"ok","redis":"ok"}` when Postgres and Redis are reachable, or `503` with failure details otherwise.
