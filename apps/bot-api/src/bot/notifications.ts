import type { Api } from "grammy";
import type { Match } from "@ashena/db";
import { findUserById } from "../modules/users/service.js";
import { otherPartyId } from "../modules/chat/service.js";
import {
  CHAT_ENDED_NEXT_PROMPT,
  CHAT_PARTNER_LEFT_MESSAGE,
  CHAT_STARTED_MESSAGE,
  MATCH_FOUND_MESSAGE,
} from "./copy.js";
import { chatEndedKeyboard, chatToolbarKeyboard, chatToolbarRemove, matchFoundKeyboard } from "./keyboards.js";

/**
 * Cross-party Telegram push notifications (US-3.4/US-4.1/US-4.7's "notify
 * the other party" side effects), extracted out of bot/matching.ts and
 * bot/chat.ts so EPIC 6's Mini App REST routes can trigger the exact same
 * pushes instead of reimplementing them — a Mini-App-originated swipe/
 * chat-start/end-chat still has to reach the other party over Telegram
 * somehow, since the Mini App itself has no push channel of its own. Every
 * function here takes a grammY `Api` client (not the polling `Bot`), so it
 * works identically whether called from a bot.ts handler's `ctx.api` or from
 * a standalone `Api` instance constructed in server.ts (mirroring
 * worker.ts's existing non-polling `Api` usage).
 */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort delivery with a couple of retries (US-3.4: "log and retry,
 * don't silently drop") — used independently per recipient so one failing
 * delivery (e.g. the other user blocked the bot) can't swallow one that
 * succeeds.
 */
export async function sendWithRetry(send: () => Promise<unknown>, label: string): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await send();
      return;
    } catch (err) {
      if (attempt === attempts) {
        console.error(`[notifications] failed to deliver ${label} after ${attempts} attempts`, err);
        return;
      }
      await delay(300 * attempt);
    }
  }
}

/**
 * Pushes the match-found message + "start chat" keyboard to the matched
 * users. `actorTelegramId` is the id of whichever side triggered the match —
 * every caller already has this in hand (ctx.internalUser bot-side,
 * request.miniAppUser REST-side), so it's passed in rather than re-fetched;
 * the other party's row is looked up since neither caller already holds it.
 * `notifyActor` (default true) lets a caller that already tells its own
 * actor some other way — the Mini App's swipe response body shows the match
 * dialog immediately, so routes/v1/matching.ts passes `false` here to avoid
 * also pushing a redundant Telegram message to a user already looking at
 * the in-app match screen; the bot has no such in-app channel, so its swipe
 * handler leaves this at the default.
 */
export async function notifyMatch(
  api: Api,
  actorTelegramId: bigint,
  match: Match,
  otherUserId: string,
  options: { notifyActor?: boolean } = {},
): Promise<void> {
  const { notifyActor = true } = options;
  const keyboard = matchFoundKeyboard(match.id);
  const other = await findUserById(otherUserId);
  await Promise.all([
    notifyActor
      ? sendWithRetry(
          () => api.sendMessage(actorTelegramId.toString(), MATCH_FOUND_MESSAGE, { reply_markup: keyboard }),
          `match notification to ${actorTelegramId}`,
        )
      : Promise.resolve(),
    other
      ? sendWithRetry(
          () => api.sendMessage(other.telegramId.toString(), MATCH_FOUND_MESSAGE, { reply_markup: keyboard }),
          `match notification to ${otherUserId}`,
        )
      : Promise.resolve(),
  ]);
}

/**
 * Pushes the chat-started message + toolbar keyboard to the other party only
 * — the acting party is always told directly by its own caller (a bot
 * handler's ctx.reply, or a REST response body Mini-App-side), so it isn't
 * duplicated here.
 */
export async function notifyChatStarted(api: Api, otherUserId: string): Promise<void> {
  const other = await findUserById(otherUserId);
  if (!other) return;
  await sendWithRetry(
    () =>
      api.sendMessage(other.telegramId.toString(), CHAT_STARTED_MESSAGE, { reply_markup: chatToolbarKeyboard() }),
    `chat-started notification to ${otherUserId}`,
  );
}

/**
 * Notifies the other party a session ended, using the same neutral copy
 * regardless of *why* it ended (user-ended, reported, banned) — per the UX
 * tone rule, a moderation-driven ending never reveals that a moderation
 * action took place. Block is the one exception (US-4.6): callers must not
 * call this for a block, no notification is sent at all.
 */
export async function notifyOtherPartySessionEnded(api: Api, match: Match, actingUserId: string): Promise<void> {
  const otherId = otherPartyId(match, actingUserId);
  const other = await findUserById(otherId);
  if (!other) return;
  const chatId = other.telegramId.toString();
  await sendWithRetry(
    () => api.sendMessage(chatId, CHAT_PARTNER_LEFT_MESSAGE, { reply_markup: chatToolbarRemove() }),
    `session-ended notification to ${otherId}`,
  );
  await sendWithRetry(
    () => api.sendMessage(chatId, CHAT_ENDED_NEXT_PROMPT, { reply_markup: chatEndedKeyboard() }),
    `session-ended next-prompt to ${otherId}`,
  );
}
