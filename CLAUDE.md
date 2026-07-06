# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This repository currently contains **only the product spec** — `ashenaiybot-prd-and-backlog.md` — no code, no `package.json`, no git history yet. There are no build/lint/test commands to run because nothing has been scaffolded. The very first implementation work (EPIC 0 below) is what creates the monorepo, tooling, and CI — once that lands, update this file with the real commands (install/build/lint/test/dev, and how to run a single test).

**Local dev environment notes** (observed on this machine, re-check if it changes): Node v22 present, `pnpm` not preinstalled but available via `corepack enable` (corepack present). Docker Engine is present but only the standalone `docker-compose` binary is available, not the `docker compose` v2 CLI plugin — compose YAML should stay compatible with both invocations. Network access to the npm registry works but with high latency (tens of seconds per request) — package installs may need generous timeouts.

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

## Planned architecture (from the PRD — not yet built)

**Monorepo layout** (pnpm workspaces or Turborepo):
- `apps/bot-api` — Node.js + TypeScript backend: grammY bot layer, Fastify REST API (`/api/v1/...`), matching engine, chat relay, moderation jobs (BullMQ). Bot handlers and REST endpoints must call the *same* service-layer functions per module (users/profiles/matching/chat/moderation/admin) — no business logic embedded directly in a grammY handler or Fastify route.
- `apps/web-miniapp` — Next.js 15 App Router Mini App, using `@telegram-apps/sdk` / `@telegram-apps/sdk-react`, validating `initData` server-side on every request.
- `apps/web-admin` — Next.js 15 Admin Panel, NextAuth (Credentials + bcrypt), role-gated routes.
- `packages/db` — Prisma schema + generated client, imported by `bot-api`.
- `packages/shared` — Zod schemas/types shared by backend and both frontends (validation must not diverge between bot and Mini App for the same fields).

**Infra**: single Docker Compose stack (`nginx`, `api`, `web-miniapp`, `web-admin`, `postgres`, `redis`, `worker`) on one VPS. Nginx does TLS termination, path routing (`/api/*`, `/`, `/admin/*`), and edge rate-limiting. Redis backs matchmaking queue, session state, and rate-limit counters; BullMQ (on the same Redis) runs async jobs (photo moderation, idle session cleanup, broadcasts).

**Design system**: Geist (`geist` npm package for Sans/Mono fonts) + Tailwind CSS v4 + shadcn/ui themed on Geist tokens — not the archived `geist-ui` community package.

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
