import type { Bot } from "grammy";
import type { Redis } from "ioredis";
import { parseAgeRangeInput, type GenderValue } from "@ashena/shared";
import type { Match } from "@ashena/db";
import { deriveOnboardingStep, findUserById } from "../modules/users/service.js";
import {
  checkAndConsumeSwipeRateLimit,
  clearBrowsingState,
  getCurrentCandidateId,
  getNextCandidate,
  getOrCreatePreference,
  recordSwipeAndCheckMatch,
  upsertPreference,
  type CandidateCard,
} from "../modules/matching/service.js";
import type { BotContext } from "./context.js";
import type { AwaitingInputStore } from "./awaitingInput.js";
import { sendMainMenu } from "./onboarding.js";
import {
  CHAT_START_PLACEHOLDER_MESSAGE,
  FIND_MATCH_EMPTY_MESSAGE,
  MATCH_FOUND_MESSAGE,
  PREF_AGE_RANGE_INVALID_FORMAT_MESSAGE,
  PREF_AGE_RANGE_MIN_AFTER_MAX_MESSAGE,
  PREF_AGE_RANGE_OUT_OF_BOUNDS_MESSAGE,
  PREF_AGE_RANGE_PROMPT,
  PREF_AGE_RANGE_SAVED_MESSAGE,
  PREF_GENDER_MIN_REQUIRED_MESSAGE,
  PREF_GENDER_PROMPT,
  PREF_GENDER_SAVED_MESSAGE,
  SETTINGS_MENU_MESSAGE,
  SWIPE_CARD_EXPIRED_MESSAGE,
  SWIPE_RATE_LIMITED_MESSAGE,
  formatCandidateCard,
  formatPreferenceSummary,
} from "./copy.js";
import {
  CB,
  candidateCardKeyboard,
  candidateSwipeId,
  genderPreferenceKeyboard,
  genderPreferenceToggleValue,
  getMessageInlineKeyboard,
  getSelectedGenderPreferences,
  mainMenuKeyboard,
  matchFoundKeyboard,
  matchIdFromStartCallback,
  prefCancelKeyboard,
  setsAreEqual,
  settingsMenuKeyboard,
  toggleGenderPreference,
} from "./keyboards.js";

export interface MatchingDeps {
  redis: Redis;
  awaitingInput: AwaitingInputStore;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort delivery with a couple of retries (US-3.4: "log and retry,
 * don't silently drop") — used for both match notifications independently,
 * so one failing (e.g. the other user blocked the bot) can't swallow the one
 * that succeeds.
 */
async function sendWithRetry(send: () => Promise<unknown>, label: string): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await send();
      return;
    } catch (err) {
      if (attempt === attempts) {
        console.error(`[matching] failed to deliver ${label} after ${attempts} attempts`, err);
        return;
      }
      await delay(300 * attempt);
    }
  }
}

/**
 * Registers the EPIC 3 matching flow (US-3.1..3.6) on top of EPIC 2's
 * onboarding handlers — must be registered AFTER registerOnboardingHandlers
 * so its callback_query:data/message:text handlers, which end by calling
 * next() for data they don't recognize, fall through to these.
 */
export function registerMatchingHandlers(bot: Bot<BotContext>, deps: MatchingDeps): void {
  const { redis, awaitingInput } = deps;

  async function sendCandidateCard(ctx: BotContext, candidate: CandidateCard): Promise<void> {
    const caption = formatCandidateCard(candidate.profile);
    const keyboard = candidateCardKeyboard(candidate.user.id);
    if (candidate.profile?.photoModerationStatus === "approved" && candidate.profile.photoUrl) {
      await ctx.replyWithPhoto(candidate.profile.photoUrl, { caption, reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { reply_markup: keyboard });
    }
  }

  async function showNextCandidateOrEmpty(ctx: BotContext): Promise<void> {
    const candidate = await getNextCandidate(redis, ctx.internalUser);
    if (!candidate) {
      await ctx.reply(FIND_MATCH_EMPTY_MESSAGE, { reply_markup: mainMenuKeyboard() });
      return;
    }
    await sendCandidateCard(ctx, candidate);
  }

  async function sendSettingsMenu(ctx: BotContext): Promise<void> {
    const preference = await getOrCreatePreference(ctx.internalUser);
    await ctx.reply(`${SETTINGS_MENU_MESSAGE}\n\n${formatPreferenceSummary(preference)}`, {
      reply_markup: settingsMenuKeyboard(),
    });
  }

  async function notifyMatch(ctx: BotContext, match: Match, otherUserId: string): Promise<void> {
    const keyboard = matchFoundKeyboard(match.id);
    const other = await findUserById(otherUserId);
    await Promise.all([
      sendWithRetry(
        () => ctx.reply(MATCH_FOUND_MESSAGE, { reply_markup: keyboard }),
        `match notification to ${ctx.internalUser.id}`,
      ),
      other
        ? sendWithRetry(
            () =>
              ctx.api.sendMessage(other.telegramId.toString(), MATCH_FOUND_MESSAGE, { reply_markup: keyboard }),
            `match notification to ${otherUserId}`,
          )
        : Promise.resolve(),
    ]);
  }

  // Last handler in the chain today (see registerMatchingHandlers' doc
  // comment), so its own catch-all below acks unconditionally instead of
  // calling next() — revisit if a later epic registers another handler
  // after this one.
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.internalUser.id;

    // Defense in depth, mirroring onboarding.ts's own age-gate guard:
    // callback_data can in principle be forged/replayed by a non-standard
    // client independently of which buttons the bot actually showed. Every
    // action below assumes a complete profile (gender/birthDate set,
    // preferences derivable) — refuse them for anyone who hasn't actually
    // finished required onboarding rather than trusting onboarding.ts's
    // guard (which only checks the age gate) to cover this forever.
    if (deriveOnboardingStep(ctx.internalUser) !== "complete") {
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === CB.menuFind) {
      await ctx.answerCallbackQuery();
      await showNextCandidateOrEmpty(ctx);
      return;
    }

    if (data === CB.browseBack) {
      await clearBrowsingState(redis, userId);
      await ctx.answerCallbackQuery();
      await sendMainMenu(ctx);
      return;
    }

    const swipe = candidateSwipeId(data);
    if (swipe) {
      const current = await getCurrentCandidateId(redis, userId);
      if (current === null) {
        // The "current candidate" Redis key has a TTL (see
        // QUEUE_TTL_SECONDS) and expired — this is a legitimate tap on a
        // long-stale card, not a duplicate delivery, so say so instead of
        // silently dropping it.
        await ctx.answerCallbackQuery({ text: SWIPE_CARD_EXPIRED_MESSAGE, show_alert: true });
        return;
      }
      if (current !== swipe.candidateId) {
        // Stale/duplicate tap — a rapid double-tap can deliver two
        // callback_query updates for the same card; once we've moved past
        // it, ack without recording a second swipe or re-advancing the
        // queue (US-3.3). The DB-level upsert+unique-constraint in
        // recordSwipeAndCheckMatch is the real correctness guarantee; this
        // is a cheap first line of defense against the common case.
        await ctx.answerCallbackQuery();
        return;
      }

      const allowed = await checkAndConsumeSwipeRateLimit(redis, userId);
      if (!allowed) {
        await ctx.answerCallbackQuery({ text: SWIPE_RATE_LIMITED_MESSAGE, show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery();
      const { match } = await recordSwipeAndCheckMatch(userId, swipe.candidateId, swipe.isLike ? "like" : "pass");
      if (match) {
        await notifyMatch(ctx, match, swipe.candidateId);
      }
      await showNextCandidateOrEmpty(ctx);
      return;
    }

    if (data === CB.menuSettings) {
      await ctx.answerCallbackQuery();
      await sendSettingsMenu(ctx);
      return;
    }

    if (data === CB.settingsBack) {
      await ctx.answerCallbackQuery();
      await sendMainMenu(ctx);
      return;
    }

    if (data === CB.prefEditGenders) {
      const preference = await getOrCreatePreference(ctx.internalUser);
      await ctx.answerCallbackQuery();
      await ctx.reply(PREF_GENDER_PROMPT, {
        reply_markup: genderPreferenceKeyboard(new Set(preference.interestedInGenders as GenderValue[])),
      });
      return;
    }

    const genderToggleValue = genderPreferenceToggleValue(data);
    if (genderToggleValue) {
      const currentSelected = new Set(getSelectedGenderPreferences(getMessageInlineKeyboard(ctx)));
      const nextSelected = toggleGenderPreference(currentSelected, genderToggleValue);
      if (setsAreEqual(currentSelected, nextSelected)) {
        await ctx.answerCallbackQuery({ text: PREF_GENDER_MIN_REQUIRED_MESSAGE, show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: genderPreferenceKeyboard(nextSelected) });
      return;
    }

    if (data === CB.prefGenderDone) {
      const selected = getSelectedGenderPreferences(getMessageInlineKeyboard(ctx));
      const preference = await getOrCreatePreference(ctx.internalUser);
      await upsertPreference(userId, {
        interestedInGenders: selected,
        minAge: preference.minAge,
        maxAge: preference.maxAge,
      });
      await ctx.answerCallbackQuery({ text: PREF_GENDER_SAVED_MESSAGE });
      await sendSettingsMenu(ctx);
      return;
    }

    if (data === CB.prefEditAgeRange) {
      awaitingInput.set(userId, { field: "age_range", mode: "edit" });
      await ctx.answerCallbackQuery();
      await ctx.reply(PREF_AGE_RANGE_PROMPT, { reply_markup: prefCancelKeyboard() });
      return;
    }

    if (data === CB.prefCancel) {
      awaitingInput.clear(userId);
      await ctx.answerCallbackQuery();
      await sendSettingsMenu(ctx);
      return;
    }

    if (matchIdFromStartCallback(data)) {
      await ctx.answerCallbackQuery();
      await ctx.reply(CHAT_START_PLACEHOLDER_MESSAGE);
      return;
    }

    // Truly unrecognized data (forged/replayed, or from a future epic not
    // wired up yet) — ack it here rather than leaving the user's client
    // spinner hanging.
    await ctx.answerCallbackQuery();
  });

  bot.on("message:text", async (ctx) => {
    const userId = ctx.internalUser.id;
    const awaiting = awaitingInput.get(userId);
    if (awaiting?.field !== "age_range") return;

    const text = ctx.message.text;
    const parsed = parseAgeRangeInput(text);
    if (!parsed.ok) {
      const message =
        parsed.reason === "invalid_format"
          ? PREF_AGE_RANGE_INVALID_FORMAT_MESSAGE
          : parsed.reason === "out_of_bounds"
            ? PREF_AGE_RANGE_OUT_OF_BOUNDS_MESSAGE
            : PREF_AGE_RANGE_MIN_AFTER_MAX_MESSAGE;
      await ctx.reply(message);
      return;
    }

    const preference = await getOrCreatePreference(ctx.internalUser);
    await upsertPreference(userId, {
      interestedInGenders: preference.interestedInGenders as GenderValue[],
      minAge: parsed.minAge,
      maxAge: parsed.maxAge,
    });
    awaitingInput.clear(userId);
    await ctx.reply(PREF_AGE_RANGE_SAVED_MESSAGE);
    await sendSettingsMenu(ctx);
  });
}
