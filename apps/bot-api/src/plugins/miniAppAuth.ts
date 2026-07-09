import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@ashena/db";
import { InvalidInitDataError, validateInitData } from "../lib/telegramInitData.js";
import { findOrCreateUserByTelegramId } from "../modules/users/service.js";
import { sendApiError } from "../lib/apiError.js";

declare module "fastify" {
  interface FastifyRequest {
    miniAppUser?: User;
  }
}

const INIT_DATA_HEADER = "x-telegram-init-data";

/**
 * Fastify preHandler enforcing US-1.4 for the REST surface: validates the
 * Mini App's initData HMAC signature before trusting (or creating) any user,
 * and rejects with 401 on anything invalid/missing.
 */
export function createMiniAppAuthPreHandler(botToken: string) {
  return async function miniAppAuthPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const initDataRaw = request.headers[INIT_DATA_HEADER];
    if (typeof initDataRaw !== "string" || initDataRaw.length === 0) {
      await sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      return;
    }

    try {
      const validated = validateInitData(initDataRaw, botToken);
      if (!validated.user) {
        throw new InvalidInitDataError("initData has no user field");
      }
      const user = await findOrCreateUserByTelegramId({
        telegramId: BigInt(validated.user.id),
        languageCode: validated.user.languageCode,
      });
      // EPIC 6: this preHandler now backs the full matching/chat/moderation
      // REST surface, not just profile CRUD — a banned or (self-)deleted
      // account must not be able to use it, mirroring identityMiddleware.ts's
      // bot-wide short-circuit for the exact same statuses. No ban-appeal
      // flow here (that stays bot-only, per EPIC 5's design) — the Mini App
      // just shows its own graceful error state on a 403, same idea as
      // US-6.1's "opened outside Telegram" state.
      if (user.status !== "active") {
        await sendApiError(reply, 403, "ACCOUNT_INACTIVE", "This account cannot use the API.");
        return;
      }
      request.miniAppUser = user;
    } catch (err) {
      if (err instanceof InvalidInitDataError) {
        await sendApiError(reply, 401, "UNAUTHENTICATED", "Invalid Telegram init data.");
        return;
      }
      throw err;
    }
  };
}
