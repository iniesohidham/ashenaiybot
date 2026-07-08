import type { Bot } from "grammy";
import type { Redis } from "ioredis";
import type { ChatSession, Match } from "@ashena/db";
import type { ReportReasonValue } from "@ashena/shared";
import { findUserById } from "../modules/users/service.js";
import {
  endSession,
  getActiveSessionForUser,
  getSessionWithMatch,
  otherPartyId,
  persistMessage,
  startOrResumeSession,
  type ActiveSession,
} from "../modules/chat/service.js";
import {
  checkAndConsumeMessageRateLimit,
  checkSpamPattern,
  checkText,
  fileReport,
  hasFiledReportForSession,
  upsertBlock,
} from "../modules/moderation/service.js";
import type { BotContext } from "./context.js";
import {
  BLOCK_CANCELLED_MESSAGE,
  BLOCK_CONFIRM_PROMPT,
  BLOCK_DONE_MESSAGE,
  CHAT_ALREADY_ENDED_MESSAGE,
  CHAT_ENDED_BY_YOU_MESSAGE,
  CHAT_ENDED_NEXT_PROMPT,
  CHAT_PARTNER_LEFT_MESSAGE,
  CHAT_RESUMED_MESSAGE,
  CHAT_STARTED_MESSAGE,
  CHAT_TOOLBAR_BLOCK_LABEL,
  CHAT_TOOLBAR_END_LABEL,
  CHAT_TOOLBAR_REPORT_LABEL,
  MESSAGE_BLOCKED_MESSAGE,
  RATE_LIMIT_EXCEEDED_MESSAGE,
  REPORT_CANCELLED_MESSAGE,
  REPORT_REASON_PROMPT,
  REPORT_SUBMITTED_MESSAGE,
  RESUME_NUDGE_MESSAGE,
  UNSUPPORTED_MESSAGE_TYPE_MESSAGE,
} from "./copy.js";
import {
  blockConfirmKeyboard,
  blockConfirmSessionId,
  CB,
  chatEndedKeyboard,
  chatToolbarKeyboard,
  chatToolbarRemove,
  matchIdFromStartCallback,
  reportReasonFromCallback,
  reportReasonKeyboard,
} from "./keyboards.js";

export interface ChatDeps {
  redis: Redis;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same best-effort-with-retries approach as bot/matching.ts's notifyMatch — one failing delivery (e.g. the other user blocked the bot) can't swallow the one that succeeds. */
async function sendWithRetry(send: () => Promise<unknown>, label: string): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await send();
      return;
    } catch (err) {
      if (attempt === attempts) {
        console.error(`[chat] failed to deliver ${label} after ${attempts} attempts`, err);
        return;
      }
      await delay(300 * attempt);
    }
  }
}

/**
 * Registers the EPIC 4 chat-relay flow (US-4.1..4.6) — must be registered
 * FIRST in buildBot(), before onboarding.ts/matching.ts, so it gets first
 * refusal on every update: "match:start:", "report:", and "block:" prefixed
 * callback data are self-contained (no dependency on onboarding state) and
 * always handled here; message:text/photo is claimed here only when the
 * sender has an active ChatSession, deferring to onboarding.ts/matching.ts's
 * original (unmodified) chain via next() otherwise.
 *
 * This ordering matters beyond convenience: registering chat handling LAST
 * was tried first and had a real bug — a user with a stale awaitingInput
 * edit-mode entry (e.g. mid profile-bio-edit, abandoned to go chat instead)
 * or a message that happens to start with "/" would get hijacked by
 * onboarding.ts's own checks before ever reaching this file, silently
 * swallowing content meant for the user's هم‌صحبت. Checking "does this user
 * have an active chat session" FIRST, before any onboarding-state check runs
 * at all, closes that hole structurally rather than patching each affected
 * branch in onboarding.ts individually.
 */
export function registerChatHandlers(bot: Bot<BotContext>, deps: ChatDeps): void {
  const { redis } = deps;

  /**
   * EPIC 5 (US-5.6) — per-(session, sender) fixed-window limit, checked
   * ahead of persisting/relaying any in-chat content (text/photo/voice/
   * sticker), but after the chat-toolbar label checks in message:text so
   * tapping "پایان گفتگو"/"گزارش"/"بلاک" never counts against it. Returns
   * false (and has already replied with the rate-limit copy) when exceeded,
   * so callers just need `if (!(await ...)) return;`.
   */
  async function enforceMessageRateLimit(ctx: BotContext, sessionId: string, userId: string): Promise<boolean> {
    const withinLimit = await checkAndConsumeMessageRateLimit(redis, sessionId, userId);
    if (!withinLimit) {
      await ctx.reply(RATE_LIMIT_EXCEEDED_MESSAGE);
    }
    return withinLimit;
  }

  /**
   * Notifies the other party that the session ended, using the same neutral
   * copy regardless of *why* it ended (user-ended, reported, banned) — per
   * the UX tone rule, a moderation-driven ending never reveals that a
   * moderation action took place. Block is the one exception (US-4.6): it
   * calls endSession directly and skips this entirely, no notification at all.
   */
  async function notifyOtherPartySessionEnded(ctx: BotContext, match: Match, actingUserId: string): Promise<void> {
    const otherId = otherPartyId(match, actingUserId);
    const other = await findUserById(otherId);
    if (!other) return;
    const chatId = other.telegramId.toString();
    await sendWithRetry(
      () => ctx.api.sendMessage(chatId, CHAT_PARTNER_LEFT_MESSAGE, { reply_markup: chatToolbarRemove() }),
      `session-ended notification to ${otherId}`,
    );
    await sendWithRetry(
      () => ctx.api.sendMessage(chatId, CHAT_ENDED_NEXT_PROMPT, { reply_markup: chatEndedKeyboard() }),
      `session-ended next-prompt to ${otherId}`,
    );
  }

  async function handleStartOrResume(ctx: BotContext, matchId: string): Promise<void> {
    const result = await startOrResumeSession(redis, matchId, ctx.internalUser.id);
    if (!result) {
      // Match doesn't involve this user, or isn't active anymore — a stale
      // button from an old "Match پیدا شد" message.
      await ctx.reply(CHAT_ALREADY_ENDED_MESSAGE, { reply_markup: chatEndedKeyboard() });
      return;
    }

    if (!result.isNew) {
      await ctx.reply(CHAT_RESUMED_MESSAGE, { reply_markup: chatToolbarKeyboard() });
      return;
    }

    const other = await findUserById(result.otherUserId);
    await Promise.all([
      ctx.reply(CHAT_STARTED_MESSAGE, { reply_markup: chatToolbarKeyboard() }),
      other
        ? sendWithRetry(
            () =>
              ctx.api.sendMessage(other.telegramId.toString(), CHAT_STARTED_MESSAGE, {
                reply_markup: chatToolbarKeyboard(),
              }),
            `chat-started notification to ${result.otherUserId}`,
          )
        : Promise.resolve(),
    ]);
  }

  async function handleEndChat(ctx: BotContext, active: ActiveSession): Promise<void> {
    const ended = await endSession(redis, active.session.id, "user_ended", ctx.internalUser.id);
    await ctx.reply(CHAT_ENDED_BY_YOU_MESSAGE, { reply_markup: chatToolbarRemove() });
    await ctx.reply(CHAT_ENDED_NEXT_PROMPT, { reply_markup: chatEndedKeyboard() });
    if (ended) {
      await notifyOtherPartySessionEnded(ctx, ended.match, ctx.internalUser.id);
    }
  }

  /**
   * Looks up by the sessionId embedded in the callback data itself (not the
   * Redis "current active session" pointer) — the report/block action is
   * valid regardless of whether the session is STILL active by the time the
   * user confirms it (the other party could have ended/reported/blocked
   * first, or it could have hit the idle timeout, in the few seconds the
   * reason-picker/confirm dialog was open); there just isn't a session left
   * to end in that case. Returns null only when the sessionId doesn't
   * resolve to a real session belonging to this user at all.
   */
  async function resolveSessionForAction(
    userId: string,
    sessionId: string,
  ): Promise<{ session: ChatSession & { match: Match }; otherUserId: string } | null> {
    const session = await getSessionWithMatch(sessionId);
    if (!session) return null;
    if (session.match.userAId !== userId && session.match.userBId !== userId) return null;
    return { session, otherUserId: otherPartyId(session.match, userId) };
  }

  async function handleReportReasonPicked(ctx: BotContext, reason: ReportReasonValue, sessionId: string): Promise<void> {
    const reporterId = ctx.internalUser.id;
    const resolved = await resolveSessionForAction(reporterId, sessionId);
    if (!resolved) {
      await ctx.reply(CHAT_ALREADY_ENDED_MESSAGE, { reply_markup: chatEndedKeyboard() });
      return;
    }
    const { session, otherUserId } = resolved;

    if (await hasFiledReportForSession(reporterId, sessionId)) {
      // Duplicate delivery of this reporter's own already-processed tap
      // (Telegram can double-deliver callback_query updates) — Report has no
      // unique constraint to make fileReport() naturally idempotent the way
      // upsertBlock() is below, so this is checked explicitly. Reassure
      // rather than file a second Report row for the same incident.
      await ctx.reply(REPORT_SUBMITTED_MESSAGE, { reply_markup: chatToolbarRemove() });
      await ctx.reply(CHAT_ENDED_NEXT_PROMPT, { reply_markup: chatEndedKeyboard() });
      return;
    }

    await fileReport(reporterId, otherUserId, session.id, reason);
    const ended = session.endedAt === null ? await endSession(redis, session.id, "reported", reporterId) : null;
    await ctx.reply(REPORT_SUBMITTED_MESSAGE, { reply_markup: chatToolbarRemove() });
    await ctx.reply(CHAT_ENDED_NEXT_PROMPT, { reply_markup: chatEndedKeyboard() });
    if (ended) {
      await notifyOtherPartySessionEnded(ctx, ended.match, reporterId);
    }
  }

  async function handleBlockConfirmed(ctx: BotContext, sessionId: string): Promise<void> {
    const blockerId = ctx.internalUser.id;
    const resolved = await resolveSessionForAction(blockerId, sessionId);
    if (!resolved) {
      await ctx.reply(CHAT_ALREADY_ENDED_MESSAGE, { reply_markup: chatEndedKeyboard() });
      return;
    }
    const { session, otherUserId } = resolved;

    // upsertBlock is an upsert on a real unique constraint, so a duplicate
    // delivery of this same tap is naturally harmless — no extra dedup
    // needed here the way handleReportReasonPicked needs one above.
    await upsertBlock(blockerId, otherUserId);
    if (session.endedAt === null) {
      await endSession(redis, session.id, "blocked", blockerId);
    }
    await ctx.reply(BLOCK_DONE_MESSAGE, { reply_markup: chatToolbarRemove() });
    await ctx.reply(CHAT_ENDED_NEXT_PROMPT, { reply_markup: chatEndedKeyboard() });
    // US-4.6 AC: blocking does not notify the blocked party at all — unlike
    // end-chat/report, nothing is sent to them here, on purpose.
  }

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    const matchId = matchIdFromStartCallback(data);
    if (matchId) {
      await ctx.answerCallbackQuery();
      await handleStartOrResume(ctx, matchId);
      return;
    }

    const reportPick = reportReasonFromCallback(data);
    if (reportPick) {
      await ctx.answerCallbackQuery();
      await handleReportReasonPicked(ctx, reportPick.reason, reportPick.sessionId);
      return;
    }

    if (data === CB.reportCancel) {
      await ctx.answerCallbackQuery();
      await ctx.reply(REPORT_CANCELLED_MESSAGE);
      return;
    }

    const blockSessionId = blockConfirmSessionId(data);
    if (blockSessionId) {
      await ctx.answerCallbackQuery();
      await handleBlockConfirmed(ctx, blockSessionId);
      return;
    }

    if (data === CB.blockCancel) {
      await ctx.answerCallbackQuery();
      await ctx.reply(BLOCK_CANCELLED_MESSAGE);
      return;
    }

    // Not one of ours — defer to onboarding.ts/matching.ts's original chain.
    await next();
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    const userId = ctx.internalUser.id;

    const active = await getActiveSessionForUser(redis, userId);
    if (!active) {
      // No active chat session — this isn't ours to handle; defer to
      // onboarding.ts/matching.ts's original chain (see this module's doc
      // comment for why checking this FIRST, before any onboarding-state
      // check runs, matters).
      await next();
      return;
    }

    if (text === CHAT_TOOLBAR_END_LABEL) {
      await handleEndChat(ctx, active);
      return;
    }

    if (text === CHAT_TOOLBAR_REPORT_LABEL) {
      await ctx.reply(REPORT_REASON_PROMPT, { reply_markup: reportReasonKeyboard(active.session.id) });
      return;
    }

    if (text === CHAT_TOOLBAR_BLOCK_LABEL) {
      await ctx.reply(BLOCK_CONFIRM_PROMPT, { reply_markup: blockConfirmKeyboard(active.session.id) });
      return;
    }

    if (!(await enforceMessageRateLimit(ctx, active.session.id, userId))) return;

    const check = await checkText(text);
    if (check.blocked) {
      await persistMessage(active.session.id, userId, "text", text, true, check.patternId ?? null);
      if (check.severity === "high") {
        // The closed ReportReason enum has no generic "system-detected"
        // value — "suspected_minor" is the PRD's own paradigm example of
        // what a high-severity pattern represents (US-5.1's AC), so it's
        // used for every keyword-filter-driven auto-flag, not just literal
        // age-related hits.
        await fileReport(null, userId, active.session.id, "suspected_minor");
      }
      await ctx.reply(MESSAGE_BLOCKED_MESSAGE);
      return;
    }

    // Persisted BEFORE the spam-pattern check below so this very message
    // counts toward its own distinct-session tally — checking first would
    // mean the message that actually crosses the threshold never gets
    // counted until a 4th distinct session sends it (off-by-one).
    await persistMessage(active.session.id, userId, "text", text, false);

    // US-5.6's spam-pattern signal: flags for review (auto-files a `spam`
    // Report) but, unlike the keyword filter above, does NOT block delivery
    // — the AC only asks that the sender be flagged, not silenced.
    if (await checkSpamPattern(userId, text)) {
      await fileReport(null, userId, active.session.id, "spam");
    }

    const other = await findUserById(active.otherUserId);
    if (other) {
      await sendWithRetry(
        () => ctx.api.sendMessage(other.telegramId.toString(), text),
        `text relay to ${active.otherUserId}`,
      );
    }
  });

  bot.on("message:photo", async (ctx, next) => {
    const userId = ctx.internalUser.id;
    const active = await getActiveSessionForUser(redis, userId);
    if (!active) {
      // Defer to onboarding.ts's original profile-photo-upload handler.
      await next();
      return;
    }

    if (!(await enforceMessageRateLimit(ctx, active.session.id, userId))) return;

    const sizes = ctx.message.photo;
    const largest = sizes[sizes.length - 1];
    if (!largest) return;

    await persistMessage(active.session.id, userId, "photo", largest.file_id, false);
    const other = await findUserById(active.otherUserId);
    if (other) {
      await sendWithRetry(
        () => ctx.api.sendPhoto(other.telegramId.toString(), largest.file_id),
        `photo relay to ${active.otherUserId}`,
      );
    }
  });

  bot.on("message:voice", async (ctx) => {
    const userId = ctx.internalUser.id;
    const active = await getActiveSessionForUser(redis, userId);
    if (!active) {
      await ctx.reply(RESUME_NUDGE_MESSAGE);
      return;
    }

    if (!(await enforceMessageRateLimit(ctx, active.session.id, userId))) return;

    const fileId = ctx.message.voice.file_id;
    await persistMessage(active.session.id, userId, "voice", fileId, false);
    const other = await findUserById(active.otherUserId);
    if (other) {
      await sendWithRetry(
        () => ctx.api.sendVoice(other.telegramId.toString(), fileId),
        `voice relay to ${active.otherUserId}`,
      );
    }
  });

  bot.on("message:sticker", async (ctx) => {
    const userId = ctx.internalUser.id;
    const active = await getActiveSessionForUser(redis, userId);
    if (!active) {
      await ctx.reply(RESUME_NUDGE_MESSAGE);
      return;
    }

    if (!(await enforceMessageRateLimit(ctx, active.session.id, userId))) return;

    const fileId = ctx.message.sticker.file_id;
    await persistMessage(active.session.id, userId, "sticker", fileId, false);
    const other = await findUserById(active.otherUserId);
    if (other) {
      await sendWithRetry(
        () => ctx.api.sendSticker(other.telegramId.toString(), fileId),
        `sticker relay to ${active.otherUserId}`,
      );
    }
  });

  // Trailing catch-all for message subtypes with no dedicated handler above
  // (video, document, location, ...). NOTE: grammY's bare "message" filter
  // matches EVERY message subtype, including text/photo — it does not skip
  // this handler just because message:text/message:photo already ran; those
  // only stop the whole chain when they DON'T call next(). When they defer
  // (no active session), this handler runs too for the same update, so it
  // must explicitly bail via next() for the subtypes already owned by a
  // handler above — otherwise a "/start"/"/menu" text message (or a
  // profile-photo upload) gets swallowed here before ever reaching
  // onboarding.ts's command/message handlers.
  bot.on("message", async (ctx, next) => {
    if (ctx.message.text || ctx.message.photo || ctx.message.voice || ctx.message.sticker) {
      await next();
      return;
    }
    const userId = ctx.internalUser.id;
    const active = await getActiveSessionForUser(redis, userId);
    if (!active) {
      await ctx.reply(RESUME_NUDGE_MESSAGE);
      return;
    }
    await ctx.reply(UNSUPPORTED_MESSAGE_TYPE_MESSAGE);
  });
}
