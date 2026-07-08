import type { Redis } from "ioredis";
import {
  prisma,
  type ChatSession,
  type ChatSessionEndReason,
  type Match,
  type Message,
  type MessageType,
} from "@ashena/db";

// EPIC 4 (US-4.1..4.7) — chat session lifecycle + message persistence. Redis
// backs a fast-path "which session is this user currently in" pointer
// (mirrors modules/matching/service.ts's `matching:current:<userId>`
// pattern): Postgres remains the source of truth, a cache miss just costs
// one extra query and repopulates the pointer, it's never load-bearing for
// correctness.
//
// Concurrency simplification: the product UX (browse -> match -> chat ->
// "next") is sequential, one conversation at a time — this pointer is a
// singleton per user (last-started-or-resumed session wins) rather than a
// multi-conversation inbox. A user can still technically hold multiple
// simultaneously-active Matches/ChatSessions (nothing in EPIC 3 prevents
// it), but only the most recently opened one is what plain-text messages
// route to; older ones remain resumable via their own match:start callback.

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function activeSessionKey(userId: string): string {
  return `chat:active:${userId}`;
}

export function otherPartyId(match: Pick<Match, "userAId" | "userBId">, userId: string): string {
  return match.userAId === userId ? match.userBId : match.userAId;
}

async function setActivePointers(redis: Redis, match: Pick<Match, "userAId" | "userBId">, sessionId: string): Promise<void> {
  await Promise.all([
    redis.set(activeSessionKey(match.userAId), sessionId, "EX", SESSION_TTL_SECONDS),
    redis.set(activeSessionKey(match.userBId), sessionId, "EX", SESSION_TTL_SECONDS),
  ]);
}

// Atomic compare-and-delete (GET+DEL as two round-trips would leave a window
// where a concurrent startOrResumeSession sets a new pointer between them,
// and this would wipe out that unrelated, legitimately-current pointer).
const COMPARE_AND_DELETE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/** Only clears a user's pointer if it still points at THIS session — a user who has since started/resumed a different session (the documented multi-match edge case) must not have that unrelated pointer wiped as collateral damage. */
async function clearActivePointerIfMatches(redis: Redis, userId: string, sessionId: string): Promise<void> {
  await redis.eval(COMPARE_AND_DELETE_SCRIPT, 1, activeSessionKey(userId), sessionId);
}

async function clearActivePointers(
  redis: Redis,
  match: Pick<Match, "userAId" | "userBId">,
  sessionId: string,
): Promise<void> {
  await Promise.all([
    clearActivePointerIfMatches(redis, match.userAId, sessionId),
    clearActivePointerIfMatches(redis, match.userBId, sessionId),
  ]);
}

export interface StartOrResumeResult {
  session: ChatSession;
  match: Match;
  otherUserId: string;
  isNew: boolean;
}

/**
 * US-4.1: finds-or-creates the open ChatSession for a match (never
 * duplicates — a second tap on "شروع گفتگو" resumes instead of erroring).
 * Returns null if the match doesn't involve the requester, isn't active,
 * either party is no longer `active` (banned/deleted since matching), or
 * either has blocked the other (US-4.6: a block must survive a stale
 * "شروع گفتگو" button on the old match-found message).
 */
export async function startOrResumeSession(
  redis: Redis,
  matchId: string,
  requesterId: string,
): Promise<StartOrResumeResult | null> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.status !== "active") return null;
  if (match.userAId !== requesterId && match.userBId !== requesterId) return null;

  const otherUserId = otherPartyId(match, requesterId);

  const [requester, other, existingBlock] = await Promise.all([
    prisma.user.findUnique({ where: { id: requesterId }, select: { status: true } }),
    prisma.user.findUnique({ where: { id: otherUserId }, select: { status: true } }),
    prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: requesterId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: requesterId },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (requester?.status !== "active" || other?.status !== "active" || existingBlock) {
    return null;
  }

  const { session, isNew } = await prisma.$transaction(async (tx) => {
    // Serializes concurrent "start chat" taps from both matched users on the
    // same match — without this, both could pass the find-open-session
    // check below before either create() commits, producing two ChatSession
    // rows for one Match. Same race class (and same fix) as
    // recordSwipeAndCheckMatch's mutual-like race in
    // modules/matching/service.ts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${matchId}))`;

    const existing = await tx.chatSession.findFirst({ where: { matchId, endedAt: null } });
    if (existing) return { session: existing, isNew: false };

    const created = await tx.chatSession.create({ data: { matchId } });
    return { session: created, isNew: true };
  });

  await setActivePointers(redis, match, session.id);
  return { session, match, otherUserId, isNew };
}

export interface ActiveSession {
  session: ChatSession;
  match: Match;
  otherUserId: string;
}

/**
 * Redis fast path with DB fallback+repopulate. A stale pointer (session
 * ended, or its match no longer active, since it was cached) is cleared and
 * treated as a miss rather than trusted; a cache hit refreshes the TTL so an
 * actively-used session's pointer doesn't expire out from under it.
 */
export async function getActiveSessionForUser(redis: Redis, userId: string): Promise<ActiveSession | null> {
  const cachedId = await redis.get(activeSessionKey(userId));
  if (cachedId) {
    const session = await prisma.chatSession.findUnique({ where: { id: cachedId }, include: { match: true } });
    if (session && session.endedAt === null && session.match.status === "active") {
      await redis.expire(activeSessionKey(userId), SESSION_TTL_SECONDS);
      return { session, match: session.match, otherUserId: otherPartyId(session.match, userId) };
    }
    await redis.del(activeSessionKey(userId));
  }

  const session = await prisma.chatSession.findFirst({
    where: {
      endedAt: null,
      match: { status: "active", OR: [{ userAId: userId }, { userBId: userId }] },
    },
    orderBy: { startedAt: "desc" },
    include: { match: true },
  });
  if (!session) return null;

  await redis.set(activeSessionKey(userId), session.id, "EX", SESSION_TTL_SECONDS);
  return { session, match: session.match, otherUserId: otherPartyId(session.match, userId) };
}

/**
 * Looks a session up by id directly (no Redis, no "active" filter) — used by
 * report/block handling, which already has the exact sessionId from its own
 * callback data and needs to act correctly whether or not the session is
 * still open (e.g. the other party ended it moments before a report/block
 * was confirmed; the report/block itself is still valid and worth
 * recording, there's just no session left to end).
 */
export function getSessionWithMatch(sessionId: string): Promise<(ChatSession & { match: Match }) | null> {
  return prisma.chatSession.findUnique({ where: { id: sessionId }, include: { match: true } });
}

export function persistMessage(
  sessionId: string,
  senderUserId: string,
  type: MessageType,
  contentRef: string,
  moderationFlag = false,
): Promise<Message> {
  return prisma.message.create({ data: { sessionId, senderUserId, type, contentRef, moderationFlag } });
}

export interface EndSessionResult {
  session: ChatSession;
  match: Match;
}

/**
 * Idempotent: the conditional updateMany (endedAt: null in the where clause)
 * makes "already ended" detection atomic rather than read-then-write, so two
 * concurrent enders (e.g. a report firing right as the other party also taps
 * "end chat") can't both think they were first. Returns null on the losing
 * side so callers never double-notify.
 */
export async function endSession(
  redis: Redis,
  sessionId: string,
  reason: ChatSessionEndReason,
  endedByUserId: string | null,
): Promise<EndSessionResult | null> {
  const result = await prisma.chatSession.updateMany({
    where: { id: sessionId, endedAt: null },
    data: { endedAt: new Date(), endedReason: reason, endedByUserId },
  });
  if (result.count === 0) return null;

  const session = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
  const match = await prisma.match.findUniqueOrThrow({ where: { id: session.matchId } });
  await clearActivePointers(redis, match, sessionId);
  return { session, match };
}

/**
 * US-4.7: ends ChatSessions with no activity (last message, or session start
 * if no messages yet) older than idleThresholdMs. Runs from the worker
 * (BullMQ) — the caller is responsible for notifying both parties.
 */
export async function cleanupIdleSessions(redis: Redis, idleThresholdMs: number): Promise<EndSessionResult[]> {
  const cutoff = new Date(Date.now() - idleThresholdMs);

  const candidates = await prisma.chatSession.findMany({
    where: { endedAt: null, startedAt: { lte: cutoff } },
    include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
  });

  const idle = candidates.filter((candidate) => {
    const lastActivity = candidate.messages[0]?.sentAt ?? candidate.startedAt;
    return lastActivity <= cutoff;
  });

  const ended: EndSessionResult[] = [];
  for (const candidate of idle) {
    const result = await endSession(redis, candidate.id, "idle_timeout", null);
    if (result) ended.push(result);
  }
  return ended;
}
