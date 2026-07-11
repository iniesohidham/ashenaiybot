-- EPIC 8 (US-8.3) data migration — backfills Event rows from history that
-- predates the Event table (previous migration:
-- 20260711081802_epic8_events_and_user_activity_fields). Without this,
-- getDashboardMetrics()'s 7-day trend (now reading exclusively from Event,
-- see modules/admin/service.ts) would show a false cliff to zero for every
-- day before this deploy, even though real signups/matches/chats/reports
-- happened on those days — an adversarial review round caught this as a
-- real regression, not an acceptable transition cost.
--
-- Safe to run against an empty database (a fresh install, or Prisma's
-- shadow database used by `prisma migrate dev` to compute schema drift):
-- each INSERT ... SELECT ... FROM <table> simply inserts zero rows when
-- the source table is empty.

-- signup_completed: no existing column records the moment onboarding
-- actually finished (User.createdAt is first Telegram contact, which can
-- precede completion by hours or days) — createdAt is used as the closest
-- available proxy, and only for users who HAVE completed onboarding
-- (mirrors the live code's own definition — see
-- modules/users/service.ts's deriveOnboardingStep()). `backfilled: true`
-- in metadata distinguishes these approximated rows from ones trackEvent()
-- creates going forward, in case that distinction ever matters later.
INSERT INTO "Event" ("id", "type", "userId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, 'signup_completed', "id", jsonb_build_object('backfilled', true), "createdAt"
FROM "User"
WHERE "ageAttestedAt" IS NOT NULL AND "gender" IS NOT NULL AND "birthDate" IS NOT NULL;

-- match_created: Match.createdAt is the exact original moment (no
-- approximation needed) — userId is left NULL, same convention
-- trackEvent()'s live call site uses (a match involves two users, not one).
INSERT INTO "Event" ("id", "type", "userId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, 'match_created', NULL,
       jsonb_build_object('matchId', "id", 'userAId', "userAId", 'userBId', "userBId", 'backfilled', true),
       "createdAt"
FROM "Match";

-- chat_ended: only sessions that actually ended (endedAt IS NOT NULL);
-- endedAt is the exact original moment.
INSERT INTO "Event" ("id", "type", "userId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, 'chat_ended', "endedByUserId",
       jsonb_build_object('sessionId', "id", 'matchId', "matchId", 'reason', "endedReason", 'backfilled', true),
       "endedAt"
FROM "ChatSession"
WHERE "endedAt" IS NOT NULL;

-- report_submitted: Report.createdAt is exact; reporterId may be NULL
-- (system-filed by the keyword filter), same as the live call site.
INSERT INTO "Event" ("id", "type", "userId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, 'report_submitted', "reporterId",
       jsonb_build_object('reportId', "id", 'reportedUserId', "reportedUserId", 'reason', "reason", 'severity', "severity", 'backfilled', true),
       "createdAt"
FROM "Report";
