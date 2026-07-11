import type { Redis } from "ioredis";
import {
  Prisma,
  prisma,
  canonicalUserPair,
  type Gender,
  type Match,
  type MatchPreference,
  type Profile,
  type SwipeActionType,
  type User,
} from "@ashena/db";
import {
  birthDateBoundsForAgeRange,
  calculateAge,
  defaultAgeRange,
  defaultInterestedInGenders,
  MIN_AGE,
  SWIPE_RATE_LIMIT_PER_MINUTE,
  type GenderValue,
} from "@ashena/shared";
import { trackEvent } from "../events/service.js";

// --- Preferences (US-3.1) -----------------------------------------------

export function getPreference(userId: string): Promise<MatchPreference | null> {
  return prisma.matchPreference.findUnique({ where: { userId } });
}

export interface PreferenceInput {
  interestedInGenders: GenderValue[];
  minAge: number;
  maxAge: number;
}

export function upsertPreference(userId: string, input: PreferenceInput): Promise<MatchPreference> {
  return prisma.matchPreference.upsert({
    where: { userId },
    update: input,
    create: { userId, ...input },
  });
}

/**
 * Ensures a preference row exists, seeding it from the user's own
 * gender/birthDate the first time it's needed (US-3.1's "sensible defaults").
 * Called from the bot's main-menu entry point so every completed profile
 * gets one lazily — including users who onboarded before EPIC 3 shipped.
 */
export async function getOrCreatePreference(
  user: Pick<User, "id" | "gender" | "birthDate">,
): Promise<MatchPreference> {
  const existing = await getPreference(user.id);
  if (existing) return existing;

  const age = user.birthDate ? calculateAge(user.birthDate) : MIN_AGE;
  return upsertPreference(user.id, {
    interestedInGenders: defaultInterestedInGenders(user.gender as GenderValue | null),
    ...defaultAgeRange(age),
  });
}

// --- Candidate queue (US-3.2) -------------------------------------------

const CANDIDATE_BATCH_SIZE = 20;
const SWIPE_COOLDOWN_DAYS = 30;
const QUEUE_TTL_SECONDS = 60 * 60;
const MAX_REFILL_ATTEMPTS = 3;
const REFILL_LOCK_TTL_MS = 5000;
const REFILL_LOCK_RETRY_DELAY_MS = 150;

function queueKey(userId: string): string {
  return `matching:queue:${userId}`;
}

function currentKey(userId: string): string {
  return `matching:current:${userId}`;
}

function refillLockKey(userId: string): string {
  return `matching:refilling:${userId}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryCandidateIds(
  requester: Pick<User, "id" | "gender">,
  requesterAge: number,
  preference: Pick<MatchPreference, "interestedInGenders" | "minAge" | "maxAge">,
  excludeIds: string[],
): Promise<string[]> {
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - SWIPE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const { minBirthDate, maxBirthDate } = birthDateBoundsForAgeRange(preference.minAge, preference.maxAge, now);

  const rows = await prisma.user.findMany({
    where: {
      id: { notIn: [requester.id, ...excludeIds] },
      status: "active",
      gender: { in: preference.interestedInGenders as Gender[] },
      birthDate: { gt: minBirthDate, lte: maxBirthDate },
      matchPreference: {
        interestedInGenders: { has: requester.gender as Gender },
        minAge: { lte: requesterAge },
        maxAge: { gte: requesterAge },
      },
      NOT: {
        OR: [
          { blocksReceived: { some: { blockerId: requester.id } } },
          { blocksInitiated: { some: { blockedId: requester.id } } },
        ],
      },
      swipesReceived: {
        none: { actorUserId: requester.id, createdAt: { gt: cooldownCutoff } },
      },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_BATCH_SIZE,
  });

  return rows.map((row) => row.id);
}

export interface CandidateCard {
  user: User;
  profile: Profile | null;
}

/**
 * Refills the Redis queue from Postgres (candidate selection logic, US-3.2),
 * guarded by a short per-user lock. Without this, two concurrent calls for
 * the same user (a rapid double-tap on "find match", or the same account
 * open on two devices) would both see an empty queue, both query the same
 * Postgres batch, and both push it — duplicating every candidate in the
 * batch. Returns whether the queue has anything in it afterward.
 */
async function refillQueue(
  redis: Redis,
  requester: Pick<User, "id" | "gender">,
  requesterAge: number,
  preference: Pick<MatchPreference, "interestedInGenders" | "minAge" | "maxAge">,
): Promise<boolean> {
  const lockKey = refillLockKey(requester.id);
  const acquired = await redis.set(lockKey, "1", "PX", REFILL_LOCK_TTL_MS, "NX");
  if (!acquired) {
    // Another call is already refilling — give it a moment rather than
    // racing the same Postgres query, then just see what it left behind.
    await delay(REFILL_LOCK_RETRY_DELAY_MS);
    return (await redis.llen(queueKey(requester.id))) > 0;
  }

  try {
    const freshIds = await queryCandidateIds(requester, requesterAge, preference, []);
    if (freshIds.length > 0) {
      await redis.rpush(queueKey(requester.id), ...freshIds);
      await redis.expire(queueKey(requester.id), QUEUE_TTL_SECONDS);
    }
    return freshIds.length > 0;
  } finally {
    await redis.del(lockKey);
  }
}

/**
 * Pops the next candidate from this user's Redis-backed browsing queue,
 * refilling from Postgres when it runs dry. Tracks the popped id as the
 * user's "current" candidate so the swipe handler can detect a stale/
 * duplicate tap on an old card (US-3.3).
 */
export async function getNextCandidate(redis: Redis, requester: User): Promise<CandidateCard | null> {
  const preference = await getOrCreatePreference(requester);
  const requesterAge = requester.birthDate ? calculateAge(requester.birthDate) : MIN_AGE;

  for (let attempt = 0; attempt < MAX_REFILL_ATTEMPTS; attempt++) {
    let candidateId = await redis.lpop(queueKey(requester.id));

    if (!candidateId) {
      const hasMore = await refillQueue(redis, requester, requesterAge, preference);
      if (!hasMore) {
        await redis.del(currentKey(requester.id));
        return null;
      }
      candidateId = await redis.lpop(queueKey(requester.id));
    }

    if (!candidateId) continue;

    const candidate = await prisma.user.findFirst({
      where: { id: candidateId, status: "active" },
      include: { profile: true },
    });
    if (!candidate) {
      // Vanished/banned/deleted between being queued and now — try the next one.
      continue;
    }

    await redis.set(currentKey(requester.id), candidateId, "EX", QUEUE_TTL_SECONDS);
    return { user: candidate, profile: candidate.profile };
  }

  // Exhausted MAX_REFILL_ATTEMPTS (repeatedly popped vanished/banned ids) —
  // clear the stale pointer just like the empty-pool path above, so a stale
  // tap on the last real "current" candidate isn't mistaken for a fresh one.
  await redis.del(currentKey(requester.id));
  return null;
}

export async function getCurrentCandidateId(redis: Redis, userId: string): Promise<string | null> {
  return redis.get(currentKey(userId));
}

export async function clearBrowsingState(redis: Redis, userId: string): Promise<void> {
  await redis.del(currentKey(userId));
}

// --- Rate limiting (US-3.6) ---------------------------------------------

function rateLimitKey(userId: string): string {
  return `matching:swiperate:${userId}`;
}

/** Fixed-window counter in Redis (TTL-based, not Postgres) — returns false once the per-minute cap is exceeded. */
export async function checkAndConsumeSwipeRateLimit(redis: Redis, userId: string): Promise<boolean> {
  const key = rateLimitKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count <= SWIPE_RATE_LIMIT_PER_MINUTE;
}

// --- Swipes & matches (US-3.3, US-3.4) ----------------------------------

export interface SwipeResult {
  /** Set only when THIS call just created a brand new Match — the caller's signal to send notifications. */
  match: Match | null;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Records a Like/Pass and, on a mutual Like, creates the Match.
 *
 * Idempotency (US-3.3): the swipe is an upsert keyed on the DB's
 * @@unique([actorUserId, targetUserId]) constraint, so any number of
 * double-taps (same actor+target) collapse to one row regardless of timing.
 *
 * Mutual-like race (US-3.4): two different users liking each other at
 * nearly the same instant is a real race — both could run "is there a
 * reciprocal like yet?" before the other's upsert is visible, and neither
 * would create the Match. A Postgres advisory lock keyed on the canonical
 * pair serializes the two attempts: whichever one runs last is guaranteed to
 * see both swipes committed, so exactly one of the two calls gets back a
 * non-null `match` (gating exactly one round of notifications).
 */
export async function recordSwipeAndCheckMatch(
  actorId: string,
  targetId: string,
  action: SwipeActionType,
): Promise<SwipeResult> {
  await prisma.swipeAction.upsert({
    where: { actorUserId_targetUserId: { actorUserId: actorId, targetUserId: targetId } },
    update: { action, createdAt: new Date() },
    create: { actorUserId: actorId, targetUserId: targetId, action },
  });

  if (action !== "like") return { match: null };

  const [userAId, userBId] = canonicalUserPair(actorId, targetId);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userAId} || ':' || ${userBId}))`;

    const reciprocal = await tx.swipeAction.findUnique({
      where: { actorUserId_targetUserId: { actorUserId: targetId, targetUserId: actorId } },
    });
    if (!reciprocal || reciprocal.action !== "like") {
      return { match: null };
    }

    const existingMatch = await tx.match.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
    if (existingMatch) {
      return { match: null };
    }

    try {
      const match = await tx.match.create({ data: { userAId, userBId, status: "active" } });
      return { match };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { match: null };
      }
      throw err;
    }
  });

  // EPIC 8 (US-8.3) — outside the transaction, fire-and-forget (not
  // awaited: trackEvent() never throws by its own contract, so awaiting it
  // here would only add pure latency to the swipe/match response path for
  // no correctness benefit — Node keeps the process alive until the
  // underlying write completes regardless). The advisory lock above
  // already guarantees at most one of the two racing calls gets a non-null
  // match, so this fires exactly once per match. userId is left null (a
  // match involves two users, not one) — both ids live in metadata instead.
  if (result.match) {
    void trackEvent("match_created", null, { matchId: result.match.id, userAId, userBId });
  }

  return result;
}
