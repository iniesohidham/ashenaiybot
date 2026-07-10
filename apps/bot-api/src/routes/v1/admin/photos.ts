import type { FastifyInstance } from "fastify";
import { approvePhoto, listPendingPhotos, rejectPhoto } from "../../../modules/moderation/service.js";
import { findProfileByUserId } from "../../../modules/profiles/service.js";
import { findUserById } from "../../../modules/users/service.js";
import { sendWithRetry } from "../../../bot/notifications.js";
import { PHOTO_REJECTED_MESSAGE } from "../../../bot/copy.js";
import { createAdminAuthPreHandler } from "../../../plugins/adminAuth.js";
import { sendTelegramFile } from "../../../lib/telegramFile.js";
import { sendApiError } from "../../../lib/apiError.js";
import type { RouteDeps } from "../deps.js";
import type { Env } from "../../../env.js";

/** US-7.3 — the photo moderation queue UI's backing routes, both roles (no role restriction in the AC). */
export function registerAdminPhotoRoutes(
  app: FastifyInstance,
  env: Pick<Env, "ADMIN_API_SECRET" | "TELEGRAM_BOT_TOKEN">,
  deps: Pick<RouteDeps, "api">,
): void {
  const authenticate = createAdminAuthPreHandler(env.ADMIN_API_SECRET);
  const { api } = deps;

  app.get("/api/v1/admin/photos", { preHandler: authenticate }, async () => {
    return listPendingPhotos();
  });

  // The grid needs to actually render the pending image, not just its
  // userId — reuses the same file_id-proxy mechanism routes/v1/profile.ts's
  // own photo route already established (US-6.3), just without that
  // route's "approved-only unless it's your own" visibility restriction,
  // since reviewing a *pending* (by definition not-yet-approved) photo is
  // the entire point of this screen.
  app.get<{ Params: { userId: string } }>(
    "/api/v1/admin/photos/:userId/image",
    { preHandler: authenticate },
    async (request, reply) => {
      const profile = await findProfileByUserId(request.params.userId);
      if (!profile?.photoUrl) {
        return sendApiError(reply, 404, "PHOTO_NOT_FOUND", "No photo available.");
      }
      return sendTelegramFile(reply, api, env.TELEGRAM_BOT_TOKEN, profile.photoUrl);
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/api/v1/admin/photos/:userId/approve",
    { preHandler: authenticate },
    async (request) => {
      return approvePhoto(request.params.userId);
    },
  );

  // No reason field (US-7.3's AC: "rejecting requires no reason for
  // internal ones") — but the uploader IS told, via the same
  // PHOTO_REJECTED_MESSAGE copy every other rejection-adjacent flow would
  // use, mirroring how approvePhoto's caller-notifies-nothing (approval is
  // silent — the photo just starts showing) while rejection always speaks.
  app.post<{ Params: { userId: string } }>(
    "/api/v1/admin/photos/:userId/reject",
    { preHandler: authenticate },
    async (request) => {
      const profile = await rejectPhoto(request.params.userId);
      const user = await findUserById(request.params.userId);
      if (user) {
        await sendWithRetry(
          () => api.sendMessage(user.telegramId.toString(), PHOTO_REJECTED_MESSAGE),
          `photo-rejected notification to ${request.params.userId}`,
        );
      }
      return profile;
    },
  );
}
