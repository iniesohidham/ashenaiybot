# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**EPIC 0 (Infrastructure & Project Foundation) and EPIC 1 (Core Data Model & Backend API Skeleton) are implemented and verified** — pnpm workspace monorepo, Docker Compose (prod + dev), Nginx, GitHub Actions CI, full Prisma schema with an applied initial migration, an idempotent seed script, a thin User/Profile REST API with real Telegram `initData` HMAC validation, and a grammY identity-resolution middleware. EPIC 2 onward (bot onboarding, matching, chat relay, etc.) has not been built yet.

**Commands** (run from repo root):
```bash
pnpm install              # install all workspace deps
pnpm run build:packages   # build packages/db (incl. `prisma generate`) + packages/shared
pnpm build                # build every app/package — pnpm -r already orders packages/* before apps/* correctly
pnpm typecheck            # runs build:packages first, then typechecks every workspace project (see note below)
pnpm lint                 # eslint across the whole repo (flat config, one shared ruleset)
pnpm test                 # vitest run, whole repo (single root config, no per-package vitest.config)
pnpm dev                   # bot-api (tsx watch) + both Next apps in parallel, plus packages/db and packages/shared in `tsc --watch`
pnpm db:migrate            # `prisma migrate dev` against DATABASE_URL — needs a real Postgres reachable (e.g. via docker-compose.dev.yml)
pnpm db:seed               # idempotent seed: 20 users, 5 matches (3 active/2 ended), 1 pending report
```
To run a single vitest test file: `pnpm exec vitest run path/to/file.test.ts` from repo root (root `vitest.config.ts` globs `apps/*/src/**/*.test.ts` and `packages/*/src/**/*.test.ts`).

**Known environment gotchas hit while building this** (re-verify if they seem to not apply anymore):
- `pnpm` isn't preinstalled; `corepack enable` fails with `EACCES` in some sandboxes — use `npx pnpm@<version>` as a workaround, or fix corepack's permissions.
- Docker CLI may be present with **no running daemon** and no Desktop app — `colima start` (via `brew install colima`) is a working fallback; afterwards use `docker-compose` (v1 standalone binary), not `docker compose` (v2 plugin isn't installed).
- If you switch Docker contexts (e.g. Desktop → colima), `~/.docker/config.json`'s stale `credsStore` (e.g. `"desktop"`) breaks every pull with a `docker-credential-desktop not found` error — remove that key if `auths` is empty.
- The npm registry connection from this network is slow/flaky (frequent `ECONNRESET`, likely the same Iran-access risk noted in the PRD's own §9) — give installs generous timeouts and prefer `run_in_background` with direct (non-`tail`-piped) logging so progress is actually visible.
- A local HTTP(S) proxy (`http_proxy`/`https_proxy` env vars) is active and intercepts even `curl`/local-server requests to `127.0.0.1` — use `--noproxy '*'` when curling a locally-running dev server, or you'll see confusing `502` responses that look like a server bug.
- Apps resolve `@ashena/db`/`@ashena/shared` via their built `dist/` output (package.json `main`/`types`), not TS source. Each package's own `typecheck` script uses `--noEmit`, so running `pnpm -r run typecheck` alone never produces that `dist/` — that's why the root `typecheck` script runs `build:packages` first. `pnpm build` doesn't need this: pnpm already runs `packages/*`'s `build` (which does emit) before `apps/*`'s in topological order.
- Prisma CLI (`migrate`/`validate`) only auto-loads a `.env` from the **same directory as `schema.prisma`**, not the repo root — `packages/db/.env` is a symlink to `../../.env` for this reason (gitignored either way).

## What this project is

**Ashenaiy (@ashenaiybot)** is a Telegram bot for anonymous chat with strangers, layered with a simplified Tinder-like flow: build a minimal profile, browse profile cards, Like/Pass, and on a mutual Like an anonymous chat opens — messages relay between the two users without ever exposing Telegram identity (username, numeric ID, phone number).

Two surfaces share one backend and one database:
1. **Bot-native mode** — entirely inline-keyboard driven inside Telegram chat.
2. **Mini App mode** — a Next.js + Geist web app launched from `/start`, offering richer UI (swipe cards, forms, settings) for the same underlying state.

A separate Next.js **Admin Panel** handles user management, report/ban moderation, and product metrics, with two roles: `admin` (full access) and `moderator` (report queue + temporary bans only).

## Source of truth

`ashenaiybot-prd-and-backlog.md` is the canonical spec. It is written so each EPIC section can be copy-pasted directly into a Claude Code session as a self-contained work order. Read the relevant EPIC/US section before implementing it — don't rely on summaries. Key sections to know:

- **§2 Assumptions (A1–A8)** — foundational decisions (anonymity scope, age-gate via self-attestation, matching without precise geolocation, monetization out of scope, single-VPS Docker Compose hosting, admin/moderator role split).
- **§6 Architecture diagram + data model overview** — entities: `User`, `Profile`, `SwipeAction`, `Match`, `ChatSession`, `Message`, `Report`, `Block`, `AdminUser`, `BanRecord`.
- **§7 Tech stack table** — see below.
- **§8 UX Writing principles** — tone/copy rules that apply to every user-facing string across both surfaces.
- **§10 Epic ordering table** — the required build order and the reasoning for it.
- **Epics & User Stories (from "EPIC 0" onward)** — the actual backlog, in English, each with Acceptance Criteria.

## Architecture (implemented — EPIC 0/1)

**Monorepo layout** (plain pnpm workspaces, no Turborepo):
- `apps/bot-api` — Node.js + TypeScript backend: grammY bot layer (`src/bot.ts`, `src/bot/`), Fastify REST API (`src/server.ts`, `src/routes/v1/`), a BullMQ worker entrypoint (`src/worker.ts`, no jobs registered yet). Service layer lives in `src/modules/{users,profiles,matching,chat,moderation,admin}/service.ts` — `users` and `profiles` have real CRUD; the other four are intentional empty stubs (`export {}`) until their epic (3/4/5/7 respectively) fills them in. Bot handlers and REST routes both call the *same* service functions — no business logic embedded directly in a grammY handler or Fastify route, only orchestration.
- `apps/web-miniapp` — Next.js 15 App Router Mini App skeleton (hello-world page only so far). Real Telegram SDK integration, forms, and swipe deck are EPIC 6.
- `apps/web-admin` — Next.js 15 Admin Panel skeleton (hello-world page only so far). Real auth/moderation UI is EPIC 7.
- `packages/db` — Prisma schema (full EPIC 1 data model, see below) + a singleton `prisma` client. **Re-exports everything from `@prisma/client`** (`export * from "@prisma/client"` in `src/index.ts`) — other packages/apps import model/enum types from `@ashena/db`, never from `@prisma/client` directly, so this package stays the sole owner of the Prisma dependency.
- `packages/shared` — `parseEnv()` helper (used by every backend env-loading module), `APP_NAME`, and `src/api/*` — Zod request-validation schemas shared between `apps/bot-api`'s REST routes and (eventually) `apps/web-miniapp`'s forms, so validation can't drift between the bot and the Mini App for the same field (e.g. `upsertProfileSchema`).

**Auth plumbing (US-1.4)**: `apps/bot-api/src/lib/telegramInitData.ts` implements Telegram's official Mini App `initData` HMAC-SHA256 validation from scratch (no external validation package) — `secret_key = HMAC_SHA256(data=bot_token, key="WebAppData")`, `expected_hash = HMAC_SHA256(data=data_check_string, key=secret_key)`, timing-safe comparison, `auth_date` expiry check. `apps/bot-api/src/plugins/miniAppAuth.ts` wraps it as a Fastify preHandler (`x-telegram-init-data` header → 401 on anything invalid, else resolves/creates the `User` via `findOrCreateUserByTelegramId`). The bot side gets the same resolution via `apps/bot-api/src/bot/identityMiddleware.ts`, a grammY middleware setting `ctx.internalUser` (typed via the `BotContext` flavor in `bot/context.ts`) before any command handler runs.

**Infra**: single Docker Compose stack (`nginx`, `api`, `web-miniapp`, `web-admin`, `postgres`, `redis`, `worker`) on one VPS — `docker-compose.yml` for prod, `docker-compose.dev.yml` for local hot-reload dev (bind-mounts the repo over a `deps`-stage image, `tsx watch`/`next dev` as the command). Nginx (`nginx/`) does path routing (`/api/*`, `/`, `/admin/*`) and a baseline rate-limit zone over plain HTTP; the HTTPS server block is a template at `nginx/conf.d/ssl.conf.disabled` (rename once real certs exist at `nginx/certs/`, per the comments in `nginx/conf.d/default.conf`). Redis backs matchmaking queue/session state/rate-limit counters (later epics); BullMQ (same Redis) will run async jobs (photo moderation, idle session cleanup, broadcasts) — the `worker` service currently just proves Postgres+Redis connectivity.

**Design system**: Geist (`geist` npm package for Sans/Mono fonts) + Tailwind CSS v4 + shadcn/ui themed on Geist tokens — not the archived `geist-ui` community package.

## Data model notes (`packages/db/prisma/schema.prisma`) — non-obvious decisions later epics must respect

- `User.gender`/`birthDate` are **nullable**, not required: `identityMiddleware`/`miniAppAuth` create a bare `User` row on first Telegram contact (US-1.4), before EPIC 2 onboarding has collected anything. Treat "onboarding complete" as "these plus `ageAttestedAt` are all non-null", not a separate boolean flag.
- `Match.userAId`/`userBId` must always be written as a **canonical (sorted) pair** — smaller id first — by whichever service creates the row (EPIC 3's matching engine, and `packages/db/prisma/seed.ts` already does this via `canonicalPair()`). The `@@unique([userAId, userBId])` constraint only catches duplicate matches if this ordering is respected; Prisma can't express an unordered-pair constraint directly.
- `ChatSession` has both `endedReason` (enum: `user_ended` / `reported` / `blocked` / `banned` / `idle_timeout`) and a nullable `endedByUserId` — the latter is null for system-initiated endings (e.g. `idle_timeout`), so don't assume every ended session has an ending user.
- `SwipeAction` has `@@unique([actorUserId, targetUserId])` specifically so EPIC 3's double-tap idempotency (US-3.3) can rely on a DB constraint rather than app-level de-duping alone.
- `Report.reason` is a closed enum matching EPIC 4's fixed reason list (harassment/unwanted_content/suspected_minor/spam/other) — extend the enum (a migration) rather than accepting free text if new reasons are needed.

## Goals that should shape design decisions (§3)

- **G1 Activation**: ≥70% of users who send `/start` complete the minimal profile (gender, age range, 18+ attestation) in the same session — onboarding should be short and resumable, not a long form.
- **G2 Time-to-first-match**: target median under 5 minutes once supply is sufficient (no real baseline yet — post-launch data question).
- **G3 Safety SLA**: 95% of reports reviewed within 24h; high-severity reports (suspected minor, etc.) within 1h. This is why report severity/sorting (US-5.3) and immediate moderator surfacing of high-severity reports (US-4.5) are hard requirements, not nice-to-haves.
- **G4 Retention loop**: return-for-second-chat rate within 72h should be measurable (event tracking, Epic 8) even though there's no committed target yet.
- **G5 Dual-surface parity**: see constraints below — every Mini App action needs a bot-inline equivalent.

## Non-Goals for v1 — do not build these unless explicitly asked (§4)

- Monetization/payments (subscriptions, Boost, coins) — deferred to a separate spec.
- Live voice/video calls (no WebRTC infra).
- Native iOS/Android apps — bot + Telegram Mini App only.
- Mutual identity reveal — v2 feature (tracked as US-9.1 reference-only).
- Precise GPS-based matching — filters are gender/age range/(optional) language/interests only.
- Any platform besides Telegram (no WhatsApp/Instagram support).
- AI-generated ice-breakers/conversation starters — v2 (US-9.4 reference-only).

## Known risks & infra constraints (§9) — keep these in mind when choosing tools

- **Content/safety risk is critical-path**, not an add-on: photo/message abuse potential is why Epic 4 (chat relay) is hard-blocked on at least a minimal Epic 5 (keyword filter + ban) before real users touch it.
- **Self-attestation (18+) is insufficient alone** — it must be backed by a responsive report/moderation system; don't treat the age checkbox as sufficient compliance by itself.
- **Iran network access affects tooling choices**: GitHub, Sentry, and some CDNs can be intermittently restricted from Iranian IPs. This is *why* the stack deliberately avoids Sentry SaaS (uses self-hosted Pino + Prometheus + Grafana, with GlitchTip as a possible Sentry-alternative if needed) and why CI/CD platform was an open question (see Decisions log below).
- **Telegram Bot API connectivity** must be stable from wherever the server is hosted (Iran or otherwise) — flagged as a possible need for an outbound relay/proxy; not this project's problem to solve in code, but don't assume `api.telegram.org` is always trivially reachable.
- **Legal/regulatory risk** for an anonymous chat/dating-adjacent service under Iranian law is explicitly out of scope for product/engineering judgment — flagged for the user to get local legal advice on before public launch, not something to design around silently.

## Open Questions from the PRD (§12) — still unresolved, don't assume answers

- NSFW photo classifier (US-5.2): hosted API vs self-hosted model — undecided (cloud options may be unreliable from Iran).
- Exact numeric targets for G2 (time-to-first-match) and G4 (retention) — need real usage data first.
- Mini App button branding/name and its BotFather description — a product/design decision for the user.
- Whether local legal counsel is needed before public launch — see Risks above.

## Decisions log (resolved open questions, update as more get settled)

- **CI/CD platform**: GitHub Actions (chosen 2026-07-06, overriding the PRD's "open question" — the user preferred GitHub Actions over self-hosted GitLab CI despite the Iran-access risk noted in Risks above).

## Non-negotiable constraints when implementing any epic

- **Identity anonymity**: Telegram username, numeric ID, and phone number must never be shown to the other party in a match/chat. Bio/photo are not anonymous (visible by design); only Telegram-linked identity is protected.
- **Safety is not deferrable**: Report/Block/end-chat must ship *with* the chat relay (EPIC 4), not after it. Do not build chat relay without at least the baseline keyword filter + ban mechanism (minimal EPIC 5) before it's usable by real (non-internal-test) users.
- **Dual-surface parity**: every Mini App capability needs at least a simpler inline-keyboard equivalent in the bot, and both surfaces must read/write the same records (no divergent state or duplicated business logic per surface).
- **No raw age storage**: store `birthDate`, derive age at query time — never persist a stale computed age.
- **UX copy tone** (§8): CTAs start with a verb and state the concrete outcome; error messages state what happened + why + how to fix it, never raw technical/error codes; sensitive dialogs (ban, end chat, report) spell out consequences explicitly; the counterpart in chat is always called "هم‌صحبت" (never "پارتنر"/other variants); never imply to a user that their match might not be a real person.
- **Moderator vs admin**: banned-word list editing, broadcast sending, permanent-ban reversal, and user-record deletion are `admin`-only, not `moderator`.

## Working through the backlog

Per §10 of the PRD: implement one EPIC at a time, in the given order (EPIC 0 → 1 → 2 → … → 8; EPIC 9 is reference-only, out of v1 scope). Each epic depends on the previous one's data/services being in place. The PRD's own recommendation is a fresh Claude Code session/context per epic with a commit in between — keep that discipline when picking up work here.

**Progress**: EPIC 0 and EPIC 1 done and verified (typecheck/lint/test/build all pass; migration + seed run clean against a live Postgres; REST endpoints manually exercised end-to-end). Next up is EPIC 2 (Telegram Bot: Onboarding & Profile, Inline Keyboard mode) — this is where `bot.ts`'s placeholder `/start` reply gets replaced with the real age-gate/gender/birth-date/bio/photo flow described in the PRD.
