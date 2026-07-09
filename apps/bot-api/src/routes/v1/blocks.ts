import type { FastifyInstance } from "fastify";
import { createMiniAppAuthPreHandler } from "../../plugins/miniAppAuth.js";
import { listBlockedUsers, removeBlock } from "../../modules/moderation/service.js";
import { sendApiError } from "../../lib/apiError.js";
import type { Env } from "../../env.js";

/** EPIC 6 (US-6.6) — the bot has never needed a blocked-users list (blocking only ever happens inline from an active chat); this is the Mini App settings screen's read/unblock path over the same Block rows. */
export function registerBlockRoutes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">): void {
  const authenticate = createMiniAppAuthPreHandler(env.TELEGRAM_BOT_TOKEN);

  app.get("/api/v1/blocks", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    const blocked = await listBlockedUsers(user.id);
    return {
      blocked: blocked.map((entry) => ({
        userId: entry.blockedUserId,
        createdAt: entry.createdAt,
        bio: entry.profile?.displayBio ?? null,
        interests: entry.profile?.interests ?? [],
      })),
    };
  });

  app.delete<{ Params: { userId: string } }>(
    "/api/v1/blocks/:userId",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      await removeBlock(user.id, request.params.userId);
      return { unblocked: true };
    },
  );
}
