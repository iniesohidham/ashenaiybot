import type { NextFunction } from "grammy";
import { findOrCreateUserByTelegramId } from "../modules/users/service.js";
import type { BotContext } from "./context.js";

/**
 * Resolves the Telegram user behind every update into an internal User
 * record, creating one on first contact (US-1.4). Runs before any command
 * handler so the rest of the bot can assume ctx.internalUser is set.
 */
export async function identityMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) {
    // Updates with no `from` (e.g. channel posts) aren't tied to a user.
    await next();
    return;
  }

  ctx.internalUser = await findOrCreateUserByTelegramId({
    telegramId: BigInt(ctx.from.id),
    languageCode: ctx.from.language_code,
  });
  await next();
}
