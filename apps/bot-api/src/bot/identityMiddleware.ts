import type { NextFunction } from "grammy";
import { findOrCreateUserByTelegramId } from "../modules/users/service.js";
import { getLatestBanRecord } from "../modules/moderation/service.js";
import { BAN_PERMANENT_MESSAGE, banTemporaryMessage } from "./copy.js";
import type { BotContext } from "./context.js";

/**
 * Resolves the Telegram user behind every update into an internal User
 * record, creating one on first contact (US-1.4). Runs before any command
 * handler so the rest of the bot can assume ctx.internalUser is set.
 *
 * Also enforces EPIC 5's ban mechanism (US-5.4's AC: a banned user gets the
 * ban copy and no further actions are possible) — this is the single choke
 * point every other module's handlers already run through, so it covers
 * onboarding/matching/chat uniformly without touching those files.
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

  if (ctx.internalUser.status === "banned") {
    const latestBan = await getLatestBanRecord(ctx.internalUser.id);
    const message =
      latestBan?.type === "temporary" && latestBan.expiresAt
        ? banTemporaryMessage(latestBan.expiresAt)
        : BAN_PERMANENT_MESSAGE;
    // Every other terminal handler in this codebase acks unconditionally so
    // a tapped button's client-side spinner never hangs — do the same here
    // for a stale inline button a banned user still has visible.
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
    }
    // Not every update type carries a `chat` (e.g. an inline query) — guard
    // rather than let ctx.reply() throw for one this bot doesn't otherwise
    // handle anyway.
    if (ctx.chat) {
      await ctx.reply(message);
    }
    return;
  }

  await next();
}
