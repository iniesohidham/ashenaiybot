import type { FastifyInstance } from "fastify";
import { swipeActionSchema } from "@ashena/shared";
import { createMiniAppAuthPreHandler } from "../../plugins/miniAppAuth.js";
import {
  checkAndConsumeSwipeRateLimit,
  getCurrentCandidateId,
  getNextCandidate,
  recordSwipeAndCheckMatch,
} from "../../modules/matching/service.js";
import { notifyMatch } from "../../bot/notifications.js";
import { toPublicCandidate } from "../../lib/publicUser.js";
import { sendApiError, zodErrorToFields } from "../../lib/apiError.js";
import { deriveOnboardingStep } from "../../modules/users/service.js";
import type { RouteDeps } from "./deps.js";
import type { Env } from "../../env.js";

/**
 * EPIC 6 (US-6.4) — wraps the exact same candidate-queue/swipe/match
 * mechanism the bot's inline swipe deck uses (bot/matching.ts). A real match
 * still pushes a Telegram notification to the other party via
 * notifyMatch() (bot/notifications.ts) — the Mini App itself learns about
 * its own match from this call's response, it doesn't need a push for that.
 */
export function registerMatchingRoutes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">, deps: RouteDeps): void {
  const authenticate = createMiniAppAuthPreHandler(env.TELEGRAM_BOT_TOKEN);
  const { redis, api } = deps;

  app.get("/api/v1/candidates/next", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    // Same defense-in-depth guard bot/matching.ts's callback_query handler
    // applies before any swipe/browse action (deriveOnboardingStep !==
    // "complete") — without it, a bare/partial User (no gender/birthDate
    // yet) can still reach queryCandidateIds's Prisma filter, which throws
    // on a null gender/age rather than the bot's graceful onboarding prompt.
    if (deriveOnboardingStep(user) !== "complete") {
      return sendApiError(reply, 403, "ONBOARDING_INCOMPLETE", "Complete your profile before browsing candidates.");
    }
    const candidate = await getNextCandidate(redis, user);
    return { candidate: candidate ? toPublicCandidate(candidate.user, candidate.profile) : null };
  });

  app.post("/api/v1/swipes", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    if (deriveOnboardingStep(user) !== "complete") {
      return sendApiError(reply, 403, "ONBOARDING_INCOMPLETE", "Complete your profile before swiping.");
    }

    const parsed = swipeActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid swipe input.", zodErrorToFields(parsed.error));
    }
    const { targetUserId, action } = parsed.data;

    // Same stale/duplicate-tap guard as bot/matching.ts's swipe handler: a
    // null current-candidate means the pointer's TTL genuinely expired (a
    // stale card, tell the client so it can fetch a fresh one); a mismatch
    // means this is a duplicate of a swipe already recorded for the
    // previous card — ack as a no-op rather than recording a second swipe
    // against the wrong target.
    const current = await getCurrentCandidateId(redis, user.id);
    if (current === null) {
      return sendApiError(reply, 410, "CANDIDATE_EXPIRED", "This candidate is no longer available.");
    }
    if (current !== targetUserId) {
      return { matched: false, matchId: null, stale: true };
    }

    const allowed = await checkAndConsumeSwipeRateLimit(redis, user.id);
    if (!allowed) {
      return sendApiError(reply, 429, "RATE_LIMITED", "Too many swipes — slow down and try again.");
    }

    const { match } = await recordSwipeAndCheckMatch(user.id, targetUserId, action);
    if (match) {
      // notifyActor: false — this response body IS the actor's notification
      // (the Mini App shows its own match dialog immediately); only the
      // other party needs a Telegram push.
      await notifyMatch(api, user.telegramId, match, targetUserId, { notifyActor: false });
    }
    return { matched: match !== null, matchId: match?.id ?? null, stale: false };
  });
}
