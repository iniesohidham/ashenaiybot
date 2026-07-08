import type { Redis } from "ioredis";
import {
  prisma,
  type BanRecord,
  type BanType,
  type Block,
  type Report,
  type ReportReason,
  type ReportSeverity,
} from "@ashena/db";
import { endSession, type EndSessionResult } from "../chat/service.js";

// EPIC 5 (US-5.1, US-5.4 — the minimal slice that hard-blocks EPIC 4's chat
// relay per CLAUDE.md's non-negotiable constraints). Depends on
// modules/chat/service.ts (report/block/ban all end a session as a side
// effect) — one direction only; chat/service.ts has no dependency back on
// this module, so there's no import cycle.

// --- Keyword filter (US-5.1) ----------------------------------------------

const PATTERN_CACHE_TTL_MS = 60_000;

let patternCache: { patterns: Array<{ pattern: string; severity: ReportSeverity }>; expiresAt: number } | null =
  null;

async function loadPatterns(): Promise<Array<{ pattern: string; severity: ReportSeverity }>> {
  if (patternCache && patternCache.expiresAt > Date.now()) return patternCache.patterns;
  const rows = await prisma.bannedPattern.findMany({ select: { pattern: true, severity: true } });
  patternCache = { patterns: rows, expiresAt: Date.now() + PATTERN_CACHE_TTL_MS };
  return rows;
}

export interface TextCheckResult {
  blocked: boolean;
  severity?: ReportSeverity;
}

/**
 * The actual matching algorithm, separated from loadPatterns()'s DB/cache
 * concern so it's unit-testable without a live Postgres — case-insensitive
 * literal substring match, no regex engine exposed. A single `high`-severity
 * match wins outright; otherwise any `normal` match blocks with `normal`
 * severity.
 */
export function matchTextAgainstPatterns(
  text: string,
  patterns: ReadonlyArray<{ pattern: string; severity: ReportSeverity }>,
): TextCheckResult {
  const lowered = text.toLowerCase();
  let matchedNormal = false;
  for (const { pattern, severity } of patterns) {
    if (!pattern) continue;
    if (!lowered.includes(pattern.toLowerCase())) continue;
    if (severity === "high") return { blocked: true, severity: "high" };
    matchedNormal = true;
  }
  return matchedNormal ? { blocked: true, severity: "normal" } : { blocked: false };
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

// --- Block (US-4.6) --------------------------------------------------------

export function upsertBlock(blockerId: string, blockedId: string): Promise<Block> {
  return prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });
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

  const activeSessions = await prisma.chatSession.findMany({
    where: {
      endedAt: null,
      match: { status: "active", OR: [{ userAId: targetUserId }, { userBId: targetUserId }] },
    },
  });

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
