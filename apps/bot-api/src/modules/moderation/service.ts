import type { Redis } from "ioredis";
import {
  prisma,
  type BanAppeal,
  type BanRecord,
  type BanType,
  type Block,
  type Profile,
  type Report,
  type ReportReason,
  type ReportResolutionAction,
  type ReportSeverity,
} from "@ashena/db";
import {
  MESSAGE_RATE_LIMIT_PER_MINUTE,
  SPAM_DETECTION_WINDOW_MINUTES,
  SPAM_DUPLICATE_SESSION_THRESHOLD,
} from "@ashena/shared";
import { endSession, listActiveSessionsForUser, type EndSessionResult } from "../chat/service.js";

// EPIC 5 (US-5.1, US-5.4 minimal slice from EPIC 4; the rest of EPIC 5 —
// US-5.1's monitoring hook, US-5.2's photo queue, US-5.3's report triage,
// US-5.5's ban appeal, US-5.6's rate-limit/spam-detection). Depends on
// modules/chat/service.ts (report/block/ban all end a session as a side
// effect) — one direction only; chat/service.ts has no dependency back on
// this module, so there's no import cycle.

// --- Keyword filter (US-5.1) ----------------------------------------------

const PATTERN_CACHE_TTL_MS = 60_000;

interface CachedPattern {
  id: string;
  pattern: string;
  severity: ReportSeverity;
}

let patternCache: { patterns: CachedPattern[]; expiresAt: number } | null = null;

async function loadPatterns(): Promise<CachedPattern[]> {
  if (patternCache && patternCache.expiresAt > Date.now()) return patternCache.patterns;
  const rows = await prisma.bannedPattern.findMany({ select: { id: true, pattern: true, severity: true } });
  patternCache = { patterns: rows, expiresAt: Date.now() + PATTERN_CACHE_TTL_MS };
  return rows;
}

export interface TextCheckResult {
  blocked: boolean;
  severity?: ReportSeverity;
  // Which BannedPattern tripped the block, for Message.matchedPatternId —
  // US-5.1's "false-positive rate is monitored" AC needs this: a moderator
  // reviewing a flagged message (via listFlaggedMessages()) must be able to
  // tell which specific pattern to judge/edit, not just that "something"
  // matched.
  patternId?: string;
}

/**
 * The actual matching algorithm, separated from loadPatterns()'s DB/cache
 * concern so it's unit-testable without a live Postgres — case-insensitive
 * literal substring match, no regex engine exposed. A single `high`-severity
 * match wins outright; otherwise any `normal` match blocks with `normal`
 * severity.
 */
export function matchTextAgainstPatterns(text: string, patterns: ReadonlyArray<CachedPattern>): TextCheckResult {
  const lowered = text.toLowerCase();
  let normalMatch: CachedPattern | null = null;
  for (const entry of patterns) {
    if (!entry.pattern) continue;
    if (!lowered.includes(entry.pattern.toLowerCase())) continue;
    if (entry.severity === "high") return { blocked: true, severity: "high", patternId: entry.id };
    normalMatch ??= entry;
  }
  return normalMatch ? { blocked: true, severity: "normal", patternId: normalMatch.id } : { blocked: false };
}

/**
 * Cached in-process for PATTERN_CACHE_TTL_MS to keep the DB off the hot path
 * for the <2s relay-latency AC (US-4.2) — same "single-instance,
 * best-effort" tradeoff awaitingInput.ts documents for its own in-memory
 * cache.
 */
export async function checkText(text: string): Promise<TextCheckResult> {
  const patterns = await loadPatterns();
  return matchTextAgainstPatterns(text, patterns);
}

/**
 * US-5.1's "false-positive rate is monitored" AC — the actual monitoring UI
 * is Admin Panel (EPIC 7), but the query it needs is backend/DB-only and
 * ready now: every keyword-filter block already persists a Message with
 * moderationFlag=true (see bot/chat.ts) and, since matchTextAgainstPatterns
 * above, which BannedPattern matched. Oldest-first, mirroring the photo/
 * report queues' ordering convention.
 */
export function listFlaggedMessages(limit = 50): Promise<
  Array<{ id: string; sessionId: string; senderUserId: string; contentRef: string; sentAt: Date; matchedPatternId: string | null }>
> {
  return prisma.message.findMany({
    where: { moderationFlag: true },
    orderBy: { sentAt: "asc" },
    take: limit,
    select: { id: true, sessionId: true, senderUserId: true, contentRef: true, sentAt: true, matchedPatternId: true },
  });
}

/** Test-only: forces the next checkText call to reload from the DB. */
export function _resetPatternCacheForTests(): void {
  patternCache = null;
}

// --- Report (US-4.5, and US-5.1's "auto-flagged for moderator review") ---

const HIGH_SEVERITY_REASONS: ReportReason[] = ["suspected_minor"];

/** reporterId is null for system-generated reports (the keyword filter flagging a high-severity match, not a user-submitted report). */
export function fileReport(
  reporterId: string | null,
  reportedUserId: string,
  sessionId: string | null,
  reason: ReportReason,
): Promise<Report> {
  const severity: ReportSeverity = HIGH_SEVERITY_REASONS.includes(reason) ? "high" : "normal";
  return prisma.report.create({
    data: { reporterId, reportedUserId, sessionId, reason, severity },
  });
}

/**
 * Report has no unique constraint to make fileReport() naturally idempotent
 * (unlike Block) — callers that could see a duplicate delivery of the same
 * report-submission tap (e.g. bot/chat.ts's report flow) check this first so
 * a double-delivered callback_query doesn't create two Report rows for one
 * incident.
 */
export async function hasFiledReportForSession(reporterId: string, sessionId: string): Promise<boolean> {
  const existing = await prisma.report.findFirst({ where: { reporterId, sessionId }, select: { id: true } });
  return existing !== null;
}

// --- Report triage queue & SLA tracking (US-5.3) ---------------------------

export interface ReportQueueEntry {
  report: Report;
  reportedUserHistory: { pastReportCount: number; pastBanCount: number };
}

/**
 * US-5.3's AC: "sorted by severity then by creation time (oldest first
 * within the same severity)". Prisma's default enum sort is declaration
 * order (normal, high), so `desc` puts `high` first — the opposite of
 * alphabetical, which is what's wanted here. Each entry's reportedUserHistory
 * is the "reported user's history (past reports/bans)" the AC asks the
 * moderator's detail view to show; the query-only part is built here, the
 * detail-view UI itself is EPIC 7.
 */
export async function listReportQueue(limit = 50): Promise<ReportQueueEntry[]> {
  const reports = await prisma.report.findMany({
    where: { status: "pending" },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    take: limit,
  });

  return Promise.all(
    reports.map(async (report) => {
      const [pastReportCount, pastBanCount] = await Promise.all([
        prisma.report.count({ where: { reportedUserId: report.reportedUserId, id: { not: report.id } } }),
        prisma.banRecord.count({ where: { userId: report.reportedUserId } }),
      ]);
      return { report, reportedUserHistory: { pastReportCount, pastBanCount } };
    }),
  );
}

/**
 * Resolves a report with the moderator's chosen action (US-5.3's AC: "no
 * action / warn / temporary ban / permanent ban"). For the two ban actions
 * this composes with banUser() below rather than duplicating its logic —
 * same "one service calls another within this module" style
 * chat/service.ts's endSession already gets called from multiple places
 * here. `no_action`/`warn` only update the Report row; actually delivering a
 * "warn" message to the user is EPIC 7's caller's job (no warning-copy
 * channel exists yet), same deferred-notification pattern as rejectPhoto().
 */
export async function resolveReport(
  redis: Redis,
  reportId: string,
  adminId: string,
  action: ReportResolutionAction,
  banReason?: string,
): Promise<Report> {
  const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  // Guards against double-resolving the same report (e.g. two moderators
  // both opening it before either acts) — without this, both calls would
  // pass findUniqueOrThrow, potentially create two BanRecords, and the
  // second update would silently overwrite the first's
  // resolvedByAdminId/resolutionAction.
  if (report.status !== "pending") return report;

  if (action === "temporary_ban" || action === "permanent_ban") {
    const expiresAt =
      action === "temporary_ban" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
    await banUser(redis, report.reportedUserId, banReason ?? `report:${reportId}`, action === "temporary_ban" ? "temporary" : "permanent", expiresAt, adminId);
  }

  return prisma.report.update({
    where: { id: reportId },
    data: { status: "actioned", resolvedAt: new Date(), resolvedByAdminId: adminId, resolutionAction: action },
  });
}

export interface ReportSlaStats {
  totalResolved: number;
  resolvedWithin24h: number;
  highSeverityResolved: number;
  highSeverityResolvedWithin1h: number;
}

/**
 * The actual aggregation, separated from getReportSlaStats()'s DB-fetching
 * concern so it's unit-testable without a live Postgres — same
 * matchTextAgainstPatterns/checkText split this module already uses for
 * US-5.1. G3's SLA metric: 95% of reports within 24h, high-severity within 1h.
 */
export function computeReportSlaStats(
  resolvedReports: ReadonlyArray<{ severity: ReportSeverity; createdAt: Date; resolvedAt: Date }>,
): ReportSlaStats {
  let resolvedWithin24h = 0;
  let highSeverityResolved = 0;
  let highSeverityResolvedWithin1h = 0;
  for (const r of resolvedReports) {
    const resolutionMs = r.resolvedAt.getTime() - r.createdAt.getTime();
    if (resolutionMs <= 24 * 60 * 60 * 1000) resolvedWithin24h++;
    if (r.severity === "high") {
      highSeverityResolved++;
      if (resolutionMs <= 60 * 60 * 1000) highSeverityResolvedWithin1h++;
    }
  }

  return {
    totalResolved: resolvedReports.length,
    resolvedWithin24h,
    highSeverityResolved,
    highSeverityResolvedWithin1h,
  };
}

export async function getReportSlaStats(): Promise<ReportSlaStats> {
  const resolved = await prisma.report.findMany({
    where: { resolvedAt: { not: null } },
    select: { severity: true, createdAt: true, resolvedAt: true },
  });
  return computeReportSlaStats(resolved as Array<{ severity: ReportSeverity; createdAt: Date; resolvedAt: Date }>);
}

// --- Block (US-4.6) --------------------------------------------------------

export function upsertBlock(blockerId: string, blockedId: string): Promise<Block> {
  return prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });
}

export interface BlockedUserEntry {
  blockedUserId: string;
  createdAt: Date;
  profile: Pick<Profile, "displayBio" | "interests"> | null;
}

/** EPIC 6 (US-6.6) settings screen's blocked-users list — the bot has never needed this query (blocking only ever happens inline from an active chat, with no list view). */
export async function listBlockedUsers(blockerId: string): Promise<BlockedUserEntry[]> {
  const rows = await prisma.block.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { include: { profile: { select: { displayBio: true, interests: true } } } } },
  });
  return rows.map((row) => ({
    blockedUserId: row.blockedId,
    createdAt: row.createdAt,
    profile: row.blocked.profile,
  }));
}

/** Unblock — no-op if no Block row exists (deleteMany rather than delete, so an already-unblocked/duplicate request doesn't throw). */
export async function removeBlock(blockerId: string, blockedId: string): Promise<void> {
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
}

// --- Photo moderation queue (US-5.2) ---------------------------------------
//
// No automated NSFW classifier yet (an explicit, deliberate product decision
// — see PRD §12's open question and CLAUDE.md: hosted APIs carry the same
// Iran-connectivity risk flagged elsewhere in the PRD, self-hosting is real
// scope with no human review backstop yet). US-5.2's own AC allows this
// fallback verbatim: "all photos, if no reliable classifier is available
// yet, enter the manual review queue." Every uploaded photo already lands at
// photoModerationStatus="pending" (see profiles/service.ts) and nothing
// currently flips it — these functions are the EPIC-7-ready mechanism
// (approve/reject + a queue query), same "ships the mechanism, EPIC 7 wires
// the UI" pattern as banUser() below.

export interface PendingPhoto {
  userId: string;
  photoUrl: string;
  photoSubmittedAt: Date | null;
}

/** Oldest-first, same convention as listReportQueue's severity-then-createdAt ordering. */
export async function listPendingPhotos(limit = 50): Promise<PendingPhoto[]> {
  const rows = await prisma.profile.findMany({
    where: { photoModerationStatus: "pending", photoUrl: { not: null } },
    orderBy: [{ photoSubmittedAt: "asc" }],
    take: limit,
    select: { userId: true, photoUrl: true, photoSubmittedAt: true },
  });
  return rows.map((row) => ({ userId: row.userId, photoUrl: row.photoUrl as string, photoSubmittedAt: row.photoSubmittedAt }));
}

export function approvePhoto(userId: string): Promise<Profile> {
  return prisma.profile.update({ where: { userId }, data: { photoModerationStatus: "approved" } });
}

/** Notifying the uploader with the "عکس رد شد" copy (US-5.2's AC) is EPIC 7's moderator-action caller's job, mirroring how banUser() below leaves notification delivery to its (future) caller. */
export function rejectPhoto(userId: string): Promise<Profile> {
  return prisma.profile.update({ where: { userId }, data: { photoModerationStatus: "rejected" } });
}

// --- Ban (US-5.4 minimal slice: mechanism + enforcement + auto-expiry) ---

export interface BanResult {
  banRecord: BanRecord;
  endedSessions: EndSessionResult[];
}

/**
 * Creates the BanRecord, flips the user to `banned`, and ends any active
 * chat session(s) for them (US-5.4's AC) via chat/service.ts's endSession —
 * neutral `banned` ChatSessionEndReason with no endedByUserId (system-
 * initiated), so the other party's notification never reveals a moderation
 * action took place. Nothing in EPIC 4's user-facing flow calls this yet —
 * issuing a ban is EPIC 7's moderator UI — this ships the enforced mechanism
 * CLAUDE.md's hard-block requires, ready for EPIC 7 to call directly.
 */
export async function banUser(
  redis: Redis,
  targetUserId: string,
  reason: string,
  type: BanType,
  expiresAt: Date | null,
  issuedByAdminId: string,
): Promise<BanResult> {
  // Status flips to `banned` BEFORE the active-session lookup (not
  // concurrently with it) to shrink the window where a session started/
  // resumed between the two could be missed — startOrResumeSession's own
  // status check closes the rest of that gap, since it refuses to
  // start/resume once this write has landed.
  const [banRecord] = await Promise.all([
    prisma.banRecord.create({
      data: { userId: targetUserId, reason, type, expiresAt, issuedByAdminId },
    }),
    prisma.user.update({ where: { id: targetUserId }, data: { status: "banned" } }),
  ]);

  const activeSessions = await listActiveSessionsForUser(targetUserId);

  const endedSessions: EndSessionResult[] = [];
  for (const session of activeSessions) {
    const result = await endSession(redis, session.id, "banned", null);
    if (result) endedSessions.push(result);
  }

  return { banRecord, endedSessions };
}

/** Used by identityMiddleware.ts to pick the right ban copy (permanent vs. temporary-with-expiresAt) for a banned user. */
export function getLatestBanRecord(userId: string): Promise<BanRecord | null> {
  return prisma.banRecord.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/**
 * US-5.4's AC: "when a temporary ban's expiresAt passes, status
 * automatically reverts to active without manual intervention." Only
 * reverts users whose *most recent* ban is a temporary one that has
 * expired — a user whose latest ban is permanent, or whose latest temporary
 * ban hasn't expired yet, is left untouched.
 */
export async function revertExpiredBans(): Promise<string[]> {
  const bannedUsers = await prisma.user.findMany({
    where: { status: "banned" },
    select: {
      id: true,
      banRecords: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const revertedUserIds: string[] = [];
  for (const user of bannedUsers) {
    const latestBan = user.banRecords[0];
    if (!latestBan || latestBan.type !== "temporary" || !latestBan.expiresAt) continue;
    if (latestBan.expiresAt > new Date()) continue;

    await prisma.user.update({ where: { id: user.id }, data: { status: "active" } });
    revertedUserIds.push(user.id);
  }
  return revertedUserIds;
}

// --- Ban appeal (US-5.5) ----------------------------------------------------

/** DB-level enforcement lives in BanAppeal's @unique banRecordId; this check-first lets bot/identityMiddleware.ts show the right copy (already-appealed vs. can-still-appeal) without racing a unique-constraint error, same idiom as hasFiledReportForSession above. */
export async function hasAppealForBan(banRecordId: string): Promise<boolean> {
  const existing = await prisma.banAppeal.findUnique({ where: { banRecordId }, select: { id: true } });
  return existing !== null;
}

/**
 * Throws (Prisma P2002) if an appeal for this banRecordId already exists —
 * callers must check hasAppealForBan() first to show a friendly message
 * instead of letting this throw reach the user, exactly like upsertBlock's
 * unique constraint vs. fileReport's explicit hasFiledReportForSession
 * check above (BanAppeal, like Report, has real business meaning in a
 * duplicate attempt, so it errors rather than silently upserting).
 */
export function submitBanAppeal(banRecordId: string, userId: string, message: string): Promise<BanAppeal> {
  return prisma.banAppeal.create({ data: { banRecordId, userId, message } });
}

/** EPIC-7-ready query for the appeal review queue (US-5.5's AC: "a separate Admin Panel queue from regular reports"), oldest-first. */
export function listPendingBanAppeals(limit = 50): Promise<BanAppeal[]> {
  return prisma.banAppeal.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * US-5.5's AC: "appeal outcomes (upheld/reversed) are logged." A `reversed`
 * outcome also reactivates the user (status back to `active`) — mirroring
 * resolveReport() above, which composes its ban actions via banUser()
 * directly rather than leaving the user-status change to some future
 * caller; a "reversed" appeal that doesn't actually lift the ban would
 * defeat the point of appealing. Guarded against reinstating past a NEWER
 * ban: only reactivates if this appeal's BanRecord is still the user's
 * *current* one (getLatestBanRecord match) — if a fresh ban was issued
 * after this appeal was filed, resolving the old appeal must not silently
 * lift the new one.
 */
export async function resolveBanAppeal(
  appealId: string,
  adminId: string,
  outcome: Extract<BanAppeal["status"], "upheld" | "reversed">,
): Promise<BanAppeal> {
  const appeal = await prisma.banAppeal.update({
    where: { id: appealId },
    data: { status: outcome, resolvedAt: new Date(), resolvedByAdminId: adminId },
  });

  if (outcome === "reversed") {
    const latestBan = await getLatestBanRecord(appeal.userId);
    if (latestBan?.id === appeal.banRecordId) {
      await prisma.user.update({ where: { id: appeal.userId }, data: { status: "active" } });
    }
  }

  return appeal;
}

// --- Message rate limiting & spam detection (US-5.6) -----------------------

function messageRateLimitKey(sessionId: string, userId: string): string {
  return `moderation:mrate:${sessionId}:${userId}`;
}

/**
 * Fixed-window Redis counter, same technique as matching/service.ts's
 * checkAndConsumeSwipeRateLimit — keyed per (session, sender) pair since
 * US-5.6's AC is "a user cannot exceed N messages per minute per session"
 * (each participant's own contribution, not the session's combined total).
 */
export async function checkAndConsumeMessageRateLimit(
  redis: Redis,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const key = messageRateLimitKey(sessionId, userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count <= MESSAGE_RATE_LIMIT_PER_MINUTE;
}

/**
 * US-5.6's AC example verbatim: "sending the same message content to 3+
 * different active sessions within a short window flags the user for
 * review." Queries recent Messages by sender (Message's
 * @@index([senderUserId, sentAt]) backs this) rather than needing a new
 * table — distinct sessionId count is the actual signal, not raw message
 * count (a user chatting normally in one session sends plenty of messages
 * without tripping this). Auto-flagging files a `spam`-reason Report, the
 * same "system-flagged, reporterId: null" convention as the keyword
 * filter's high-severity auto-report in bot/chat.ts — this does NOT block
 * the message itself (the AC only says "flags... for review", unlike the
 * keyword filter which blocks), so callers still persist/relay it.
 */
export async function checkSpamPattern(senderUserId: string, text: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - SPAM_DETECTION_WINDOW_MINUTES * 60 * 1000);
  const rows = await prisma.message.findMany({
    where: { senderUserId, type: "text", contentRef: text, sentAt: { gte: cutoff } },
    select: { sessionId: true },
    distinct: ["sessionId"],
  });
  return rows.length >= SPAM_DUPLICATE_SESSION_THRESHOLD;
}
