import type { FastifyInstance } from "fastify";
import { createMiniAppAuthPreHandler } from "../../plugins/miniAppAuth.js";
import { endSession, listActiveSessionsForUser } from "../../modules/chat/service.js";
import { clearBrowsingState } from "../../modules/matching/service.js";
import { deleteAccount } from "../../modules/users/service.js";
import { notifyOtherPartySessionEnded } from "../../bot/notifications.js";
import { sendApiError } from "../../lib/apiError.js";
import type { RouteDeps } from "./deps.js";
import type { Env } from "../../env.js";

/**
 * EPIC 6 (US-6.6) — account deletion. Ends EVERY active chat session first
 * (same neutral "partner left" notification as a normal end-chat — deletion
 * is the user's own action, nothing here should reveal WHY the chat ended
 * any more than a report/ban would) and clears the Redis browsing pointer,
 * both orchestrated here rather than inside deleteAccount() itself — same
 * "route-level orchestration, not cross-service imports" pattern bot/chat.ts
 * already uses for moderation + chat. Uses listActiveSessionsForUser (ALL
 * active sessions), not getActiveSessionForUser's single "most recent"
 * pointer — CLAUDE.md documents that a user can hold multiple simultaneously
 * -active Matches/ChatSessions, and a deleted account must not leave any of
 * them dangling (endedAt: null forever, partner never notified) just
 * because it wasn't the newest one — same reasoning banUser() already
 * applies via this same shared function.
 */
export function registerAccountRoutes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">, deps: RouteDeps): void {
  const authenticate = createMiniAppAuthPreHandler(env.TELEGRAM_BOT_TOKEN);
  const { redis, api } = deps;

  app.delete("/api/v1/account", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }

    const activeSessions = await listActiveSessionsForUser(user.id);
    for (const session of activeSessions) {
      const ended = await endSession(redis, session.id, "user_ended", user.id);
      if (ended) {
        await notifyOtherPartySessionEnded(api, ended.match, user.id);
      }
    }
    await clearBrowsingState(redis, user.id);
    await deleteAccount(user.id);
    return { deleted: true };
  });
}
