import bcrypt from "bcryptjs";
import type { Redis } from "ioredis";
import {
  prisma,
  type AdminRole,
  type BanAppeal,
  type BannedPattern,
  type BanRecord,
  type Broadcast,
  type Gender,
  type Profile,
  type Report,
  type ReportSeverity,
  type User,
  type UserStatus,
} from "@ashena/db";
import {
  ADMIN_LOGIN_IP_RATE_LIMIT_ATTEMPTS,
  ADMIN_LOGIN_RATE_LIMIT_ATTEMPTS,
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
} from "@ashena/shared";
import { invalidatePatternCache } from "../moderation/service.js";
import { countEventsByDay } from "../events/service.js";

// EPIC 7 (Admin Panel). See CLAUDE.md's architecture notes for why this
// module owns all admin-only logic (auth, user search/detail, banned-pattern
// CRUD, dashboard metrics, broadcast) directly rather than duplicating
// existing moderation/chat/users service functions — those are reused
// as-is (banUser, deleteAccount, resolveReport, etc.), imported straight
// into the admin REST routes the same way bot handlers already do.

// --- Auth (US-7.1) -----------------------------------------------------------

function loginRateLimitKey(username: string): string {
  return `admin:loginrate:${username.toLowerCase()}`;
}

function loginIpRateLimitKey(ip: string): string {
  return `admin:loginrate:ip:${ip}`;
}

async function incrementFixedWindow(redis: Redis, key: string): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS);
  }
  return count;
}

/**
 * Fixed-window Redis counters, same technique as matching/moderation's rate
 * limiters — two of them, not one: a per-username counter alone never
 * engages against an attacker who varies the attempted username on every
 * request (each gets a fresh Redis key, so `count` never climbs past 1) — an
 * adversarial review caught this gap. `ip` (Fastify's `request.ip`, which
 * needs `trustProxy: true` — see server.ts — to reflect nginx's forwarded
 * client address rather than nginx's own) closes it with a looser threshold,
 * since a shared office/NAT IP can legitimately host several admins.
 * Satisfies US-7.1's "failed login attempts are rate-limited" AC.
 */
export async function checkAndConsumeLoginRateLimit(redis: Redis, username: string, ip: string): Promise<boolean> {
  const [usernameCount, ipCount] = await Promise.all([
    incrementFixedWindow(redis, loginRateLimitKey(username)),
    incrementFixedWindow(redis, loginIpRateLimitKey(ip)),
  ]);
  return usernameCount <= ADMIN_LOGIN_RATE_LIMIT_ATTEMPTS && ipCount <= ADMIN_LOGIN_IP_RATE_LIMIT_ATTEMPTS;
}

export interface AdminIdentity {
  id: string;
  username: string;
  role: AdminRole;
}

// A pre-computed bcrypt hash of a value nobody will ever type, used only to
// keep a nonexistent-username lookup's timing indistinguishable from a
// wrong-password one below.
const DUMMY_HASH = "$2a$10$C6UzMDM.H6dfI/f/IKcEeO/K3Kl.EYcO.PgQ.wQhE8pJvJoR9dEEG";

/** US-7.1: verifies a login attempt against AdminUser's bcrypt hash, returning the identity to embed in the session on success. */
export async function verifyAdminCredentials(username: string, password: string): Promise<AdminIdentity | null> {
  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  const valid = await bcrypt.compare(password, admin.passwordHash);
  return valid ? { id: admin.id, username: admin.username, role: admin.role } : null;
}

// --- User search & detail (US-7.4) ------------------------------------------
//
// Search is by internal user id only (never raw Telegram id) per the AC —
// getUserDetail's response also never includes `telegramId`, so identity-
// linking data simply never reaches an admin API response at all.

export interface UserSearchResult {
  id: string;
  status: UserStatus;
  gender: Gender | null;
  createdAt: Date;
  hasPhoto: boolean;
}

/** Prefix match on the internal cuid — exact ids are unwieldy to type/copy in full, this keeps the search usable without exposing any other lookup key. */
export async function searchUsersById(idPrefix: string, limit = 20): Promise<UserSearchResult[]> {
  const rows = await prisma.user.findMany({
    where: { id: { startsWith: idPrefix } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, status: true, gender: true, createdAt: true, profile: { select: { photoUrl: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    gender: row.gender,
    createdAt: row.createdAt,
    hasPhoto: row.profile?.photoUrl != null,
  }));
}

export interface UserDetail {
  user: Pick<
    User,
    | "id"
    | "status"
    | "gender"
    | "birthDate"
    | "ageAttestedAt"
    | "createdAt"
    | "lastActiveAt"
    | "notificationsOptedOut"
    | "lastNudgeSentAt"
  >;
  profile: Profile | null;
  matchCount: number;
  reportsFiledCount: number;
  reportsReceived: Report[];
  banRecords: Array<BanRecord & { issuedByAdmin: { username: string } }>;
  banAppeals: BanAppeal[];
}

/** US-7.4's "user detail view shows match/report/ban history" AC. Returns null if the id doesn't resolve to a user (route maps this to 404). */
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      gender: true,
      birthDate: true,
      ageAttestedAt: true,
      createdAt: true,
      // EPIC 8 (US-8.4) — surfaced here so a moderator investigating a
      // notifications-related support question ("I keep getting nudged
      // after opting out") can actually see this state, not just infer it.
      lastActiveAt: true,
      notificationsOptedOut: true,
      lastNudgeSentAt: true,
    },
  });
  if (!user) return null;

  // Every other list query in this module caps its result size
  // (searchUsersById, listReportQueue, listPendingPhotos/BanAppeals,
  // listBroadcasts) — these three didn't, an inconsistency an adversarial
  // review caught. 100 is generous for a single user's own history while
  // still bounding a pathological worst case (a heavily-reported/appealed
  // account) from returning an unbounded result set.
  const HISTORY_LIMIT = 100;
  const [profile, matchCount, reportsFiledCount, reportsReceived, banRecords, banAppeals] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.match.count({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
    prisma.report.count({ where: { reporterId: userId } }),
    prisma.report.findMany({ where: { reportedUserId: userId }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT }),
    prisma.banRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { issuedByAdmin: { select: { username: true } } },
      take: HISTORY_LIMIT,
    }),
    prisma.banAppeal.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT }),
  ]);

  return { user, profile, matchCount, reportsFiledCount, reportsReceived, banRecords, banAppeals };
}

// --- Banned-pattern list management (US-7.5) --------------------------------

export function listBannedPatterns(): Promise<BannedPattern[]> {
  return prisma.bannedPattern.findMany({ orderBy: { createdAt: "desc" } });
}

/** Invalidates moderation/service.ts's in-process pattern cache so the change is live for the very next message, rather than waiting out its 60s TTL — still satisfies US-7.5's AC either way, this just makes it immediate. */
export async function createBannedPattern(pattern: string, severity: ReportSeverity): Promise<BannedPattern> {
  const created = await prisma.bannedPattern.create({ data: { pattern, severity } });
  invalidatePatternCache();
  return created;
}

export async function updateBannedPattern(
  id: string,
  input: { pattern?: string; severity?: ReportSeverity },
): Promise<BannedPattern> {
  const updated = await prisma.bannedPattern.update({ where: { id }, data: input });
  invalidatePatternCache();
  return updated;
}

/** Message.matchedPatternId is onDelete: SetNull (see schema.prisma) — deleting a pattern here never destroys a historical flagged message's own record. */
export async function deleteBannedPattern(id: string): Promise<void> {
  await prisma.bannedPattern.delete({ where: { id } });
  invalidatePatternCache();
}

// --- Dashboard metrics (US-7.6) ---------------------------------------------

/** Pure — the UTC calendar-day window `daysAgo` days before `now` ("today" at daysAgo=0). Split out from getDashboardMetrics's DB fetch so it's unit-testable, same split as computeReportSlaStats/matchTextAgainstPatterns elsewhere in this codebase. */
export function utcDayBounds(daysAgo: number, now: Date): { start: Date; end: Date; date: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, date: start.toISOString().slice(0, 10) };
}

async function countDistinctActiveUsersForDay(start: Date, end: Date): Promise<number> {
  const [messageSenders, swipeActors] = await Promise.all([
    prisma.message.findMany({
      where: { sentAt: { gte: start, lt: end } },
      select: { senderUserId: true },
      distinct: ["senderUserId"],
    }),
    prisma.swipeAction.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { actorUserId: true },
      distinct: ["actorUserId"],
    }),
  ]);
  const ids = new Set<string>();
  for (const row of messageSenders) ids.add(row.senderUserId);
  for (const row of swipeActors) ids.add(row.actorUserId);
  return ids.size;
}

export interface DailyTrendEntry {
  date: string;
  dau: number;
  newSignups: number;
  matchesCreated: number;
  // EPIC 8 (US-8.3) — new trend series, backed by the Event table alongside
  // newSignups/matchesCreated below (see getDashboardMetrics's doc comment
  // for why dau stays on the older operational-table query).
  chatsEnded: number;
  reportsSubmitted: number;
}

export interface DashboardMetrics {
  today: {
    dau: number;
    newSignups: number;
    matchesCreated: number;
    // EPIC 8 (US-8.3) — same "today" + sparkline-trend shape as
    // dau/newSignups/matchesCreated above, now that the Event table backs
    // both.
    chatsEnded: number;
    reportsSubmitted: number;
    activeSessions: number;
    pendingReports: number;
    pendingPhotos: number;
  };
  trend: DailyTrendEntry[];
}

/**
 * US-7.6's AC: DAU/new-profiles/matches-created/active-sessions/pending-
 * reports/pending-photos "today", plus a 7-day trend for the three metrics
 * that are naturally day-bucketed events (DAU, signups, matches) — active
 * sessions/pending reports/pending photos are point-in-time gauges, not
 * daily events, so they're only reported as a current snapshot. `days`
 * separate per-day queries is simple and fine at "early-stage product"
 * volumes (the AC's own performance bar); worth revisiting with a single
 * groupBy if this ever becomes a real cost.
 *
 * EPIC 8 (US-8.3): newSignups/matchesCreated (plus the new chatsEnded/
 * reportsSubmitted series) now read from the Event table
 * (modules/events/service.ts's countEventsByDay) instead of the ad-hoc
 * prisma.user.count/prisma.match.count this function used pre-EPIC-8 — per
 * the AC's "Dashboard queries read from this table rather than computing
 * ad-hoc from operational tables". `dau` deliberately stays on
 * countDistinctActiveUsersForDay (operational tables): it's an aggregate
 * over *any* activity, not one of the AC's four named discrete events, and
 * moving it to the Event table would mean tracking an Event row per chat
 * message/swipe — see events/service.ts's own doc comment for that
 * tradeoff.
 */
export async function getDashboardMetrics(days = 7, now: Date = new Date()): Promise<DashboardMetrics> {
  const bounds = Array.from({ length: days }, (_, i) => utcDayBounds(days - 1 - i, now));

  const trend = await Promise.all(
    bounds.map(async ({ start, end, date }) => {
      const [dau, newSignups, matchesCreated, chatsEnded, reportsSubmitted] = await Promise.all([
        countDistinctActiveUsersForDay(start, end),
        countEventsByDay("signup_completed", start, end),
        countEventsByDay("match_created", start, end),
        countEventsByDay("chat_ended", start, end),
        countEventsByDay("report_submitted", start, end),
      ]);
      return { date, dau, newSignups, matchesCreated, chatsEnded, reportsSubmitted };
    }),
  );

  const [activeSessions, pendingReports, pendingPhotos] = await Promise.all([
    prisma.chatSession.count({ where: { endedAt: null } }),
    prisma.report.count({ where: { status: "pending" } }),
    prisma.profile.count({ where: { photoModerationStatus: "pending", photoUrl: { not: null } } }),
  ]);

  // `days` is always >= 1 in practice (default 7), so `trend` is never
  // empty — this reuses the trend's own last (=today) entry rather than
  // running the same three queries a second time.
  const todayEntry = trend.at(-1);
  if (!todayEntry) throw new Error("getDashboardMetrics requires days >= 1");
  return {
    today: {
      dau: todayEntry.dau,
      newSignups: todayEntry.newSignups,
      matchesCreated: todayEntry.matchesCreated,
      chatsEnded: todayEntry.chatsEnded,
      reportsSubmitted: todayEntry.reportsSubmitted,
      activeSessions,
      pendingReports,
      pendingPhotos,
    },
    trend,
  };
}

// --- Broadcast tool (US-7.7) -------------------------------------------------

/** Audience-size preview shown before an admin confirms a send (US-7.7's "a preview is shown... requiring explicit confirmation" AC). */
export function countBroadcastAudience(): Promise<number> {
  return prisma.user.count({ where: { status: "active" } });
}

/** Snapshots the audience size at enqueue time (not send time) — the count the admin actually confirmed sending to, even if it drifts slightly by the time the worker gets to it. Actually queuing the BullMQ job is the caller's job (routes/v1/admin/broadcast.ts), same "route/worker orchestrates, service holds the DB row" split as everything else here. */
export async function createBroadcast(adminId: string, message: string): Promise<Broadcast> {
  const totalTargeted = await countBroadcastAudience();
  return prisma.broadcast.create({
    data: { message, createdByAdminId: adminId, totalTargeted },
  });
}

export function listBroadcasts(limit = 20): Promise<Broadcast[]> {
  return prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export function findBroadcastById(id: string): Promise<Broadcast | null> {
  return prisma.broadcast.findUnique({ where: { id } });
}

export function markBroadcastSending(id: string): Promise<Broadcast> {
  return prisma.broadcast.update({ where: { id }, data: { status: "sending" } });
}

/** Called incrementally by the worker as each send resolves, so web-admin can poll live progress rather than waiting for the whole broadcast to finish. */
export function incrementBroadcastCounters(id: string, outcome: "success" | "failure"): Promise<Broadcast> {
  return prisma.broadcast.update({
    where: { id },
    data: outcome === "success" ? { successCount: { increment: 1 } } : { failureCount: { increment: 1 } },
  });
}

export function markBroadcastCompleted(id: string): Promise<Broadcast> {
  return prisma.broadcast.update({ where: { id }, data: { status: "completed", completedAt: new Date() } });
}
