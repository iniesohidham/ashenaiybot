import type { NextFunction } from "grammy";
import { BAN_APPEAL_MAX_LENGTH } from "@ashena/shared";
import { findOrCreateUserByTelegramId } from "../modules/users/service.js";
import { getLatestBanRecord, hasAppealForBan, submitBanAppeal } from "../modules/moderation/service.js";
import type { AwaitingInputStore } from "./awaitingInput.js";
import {
  ACCOUNT_DELETED_MESSAGE,
  BAN_APPEAL_ALREADY_SUBMITTED_MESSAGE,
  BAN_APPEAL_OFFER_MESSAGE,
  BAN_APPEAL_PROMPT,
  BAN_APPEAL_SUBMITTED_MESSAGE,
  BAN_APPEAL_TOO_LONG_MESSAGE,
  BAN_PERMANENT_MESSAGE,
  banTemporaryMessage,
} from "./copy.js";
import { banAppealKeyboard, chatToolbarRemove, CB } from "./keyboards.js";
import type { BotContext } from "./context.js";

export interface IdentityMiddlewareDeps {
  awaitingInput: AwaitingInputStore;
}

/**
 * Resolves the Telegram user behind every update into an internal User
 * record, creating one on first contact (US-1.4). Runs before any command
 * handler so the rest of the bot can assume ctx.internalUser is set.
 *
 * Also enforces EPIC 5's ban mechanism (US-5.4's AC: a banned user gets the
 * ban copy and no further actions are possible) — this is the single choke
 * point every other module's handlers already run through, so it covers
 * onboarding/matching/chat uniformly without touching those files. On top of
 * that it now owns the entire ban-appeal flow (US-5.5): a banned user has no
 * other handler chain available to them (this function returns without
 * next() for every banned update), so the appeal button tap and the
 * free-text appeal message it prompts for both have to be handled right
 * here rather than in a dedicated bot/*.ts module the way every other flow
 * works. Takes the same in-memory awaitingInput store bot.ts already builds
 * for onboarding.ts/matching.ts — reused here purely to disambiguate "is
 * this banned user's next text message an appeal submission", the same role
 * it plays for onboarding's optional free-text steps.
 */
export function createIdentityMiddleware(deps: IdentityMiddlewareDeps) {
  const { awaitingInput } = deps;

  return async function identityMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
    if (!ctx.from) {
      // Updates with no `from` (e.g. channel posts) aren't tied to a user.
      await next();
      return;
    }

    ctx.internalUser = await findOrCreateUserByTelegramId({
      telegramId: BigInt(ctx.from.id),
      languageCode: ctx.from.language_code,
    });

    // EPIC 6 (US-6.6): a Mini-App-deleted account must not keep working
    // bot-side either — same choke point as the banned check below, but
    // simpler (no appeal machinery, deletion was the user's own action).
    // Clears any stale chatToolbarKeyboard() the same way the banned branch
    // does, in case deletion happened mid-chat via the Mini App rather than
    // by ending the chat in Telegram first.
    if (ctx.internalUser.status === "deleted") {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery();
      }
      if (ctx.chat) {
        await ctx.reply(ACCOUNT_DELETED_MESSAGE, { reply_markup: chatToolbarRemove() });
      }
      return;
    }

    if (ctx.internalUser.status !== "banned") {
      await next();
      return;
    }

    const userId = ctx.internalUser.id;
    const latestBan = await getLatestBanRecord(userId);

    // Ban-appeal button tap.
    if (ctx.callbackQuery?.data === CB.banAppealStart) {
      await ctx.answerCallbackQuery();
      if (!latestBan) return;
      if (await hasAppealForBan(latestBan.id)) {
        await ctx.reply(BAN_APPEAL_ALREADY_SUBMITTED_MESSAGE);
        return;
      }
      awaitingInput.set(userId, { field: "ban_appeal", mode: "edit" });
      await ctx.reply(BAN_APPEAL_PROMPT);
      return;
    }

    // Free-text appeal submission, captured only while awaitingInput says so.
    if (awaitingInput.get(userId)?.field === "ban_appeal" && ctx.message?.text) {
      const text = ctx.message.text;
      if (text.length > BAN_APPEAL_MAX_LENGTH) {
        await ctx.reply(BAN_APPEAL_TOO_LONG_MESSAGE);
        return;
      }
      awaitingInput.clear(userId);
      if (latestBan) {
        if (await hasAppealForBan(latestBan.id)) {
          // Duplicate delivery of an already-processed submission (e.g. a
          // double-sent message) — BanAppeal's unique banRecordId would
          // otherwise throw here; reassure instead, same idiom as
          // bot/chat.ts's report-duplicate-tap handling.
          await ctx.reply(BAN_APPEAL_ALREADY_SUBMITTED_MESSAGE);
          return;
        }
        await submitBanAppeal(latestBan.id, userId, text);
      } else {
        // Shouldn't happen — banUser() always creates a BanRecord in the
        // same operation that flips status to "banned" — but if it ever
        // does, don't silently confirm a submission that never wrote
        // anything.
        console.error(`[identityMiddleware] banned user ${userId} has no BanRecord to appeal against`);
      }
      await ctx.reply(BAN_APPEAL_SUBMITTED_MESSAGE);
      return;
    }

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
      // banUser() ends the active ChatSession but never messages the banned
      // user directly (bans surface reactively, on their next interaction —
      // see banUser()'s doc comment) — so the chatToolbarKeyboard() reply
      // keyboard from that session is still sitting on their client with
      // nothing having ever told it to go away. Telegram reply keyboards
      // persist across every subsequent message until explicitly replaced/
      // removed, so this has to be cleared here, the first place a banned
      // user's client hears from the bot again. Two separate replies
      // because a single sendMessage can carry only one reply_markup type
      // (remove_keyboard vs. inline) — same "two messages, one clears the
      // custom keyboard, one carries the inline follow-up" idiom as
      // bot/chat.ts's handleEndChat/notifyOtherPartySessionEnded.
      await ctx.reply(message, { reply_markup: chatToolbarRemove() });
      if (latestBan) {
        await ctx.reply(BAN_APPEAL_OFFER_MESSAGE, { reply_markup: banAppealKeyboard() });
      }
    }
  };
}
