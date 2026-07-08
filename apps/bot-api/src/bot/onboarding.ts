import type { Bot } from "grammy";
import { BIO_MAX_LENGTH, isAdult, isGenderValue, parseBirthDateInput } from "@ashena/shared";
import { findProfileByUserId, upsertProfile } from "../modules/profiles/service.js";
import { deriveOnboardingStep, updateUser } from "../modules/users/service.js";
import { getOrCreatePreference } from "../modules/matching/service.js";
import type { BotContext } from "./context.js";
import type { AwaitingInputStore, AwaitingMode } from "./awaitingInput.js";
import {
  AGE_GATE_CANCELLED_MESSAGE,
  AGE_GATE_MESSAGE,
  BIO_EDIT_PROMPT,
  BIO_PROMPT,
  BIO_SAVED_MESSAGE,
  BIRTH_DATE_EDIT_PROMPT,
  BIRTH_DATE_FUTURE_MESSAGE,
  BIRTH_DATE_INVALID_DATE_MESSAGE,
  BIRTH_DATE_INVALID_FORMAT_MESSAGE,
  BIRTH_DATE_PROMPT,
  BIRTH_DATE_SAVED_MESSAGE,
  BIRTH_DATE_UNDERAGE_EDIT_MESSAGE,
  BIRTH_DATE_UNDERAGE_ONBOARDING_MESSAGE,
  EDIT_MENU_MESSAGE,
  GENDER_PROMPT,
  GENDER_SAVED_MESSAGE,
  INTERESTS_CAP_REACHED_MESSAGE,
  INTERESTS_EXPECTED_MESSAGE,
  INTERESTS_PROMPT,
  INTERESTS_SAVED_MESSAGE,
  MAIN_MENU_MESSAGE,
  MINI_APP_INTRO_MESSAGE,
  PHOTO_EDIT_PROMPT,
  PHOTO_EXPECTED_EDIT_MESSAGE,
  PHOTO_EXPECTED_MESSAGE,
  PHOTO_PROMPT,
  PHOTO_SAVED_PENDING_MESSAGE,
  RESUME_NUDGE_MESSAGE,
  WELCOME_MESSAGE,
  bioTooLongMessage,
  formatProfileSummary,
} from "./copy.js";
import {
  CB,
  ageGateKeyboard,
  bioSkipKeyboard,
  editCancelKeyboard,
  editMenuKeyboard,
  genderEditKeyboard,
  genderKeyboard,
  getMessageInlineKeyboard,
  getSelectedInterests,
  interestsKeyboard,
  mainMenuKeyboard,
  miniAppKeyboard,
  onboardingBeginKeyboard,
  photoSkipKeyboard,
  setsAreEqual,
  toggleInterest,
} from "./keyboards.js";

export interface OnboardingDeps {
  awaitingInput: AwaitingInputStore;
  miniAppUrl: string;
}

/**
 * Also ensures a default MatchPreference exists (EPIC 3, US-3.1) — this is
 * the one choke point every "onboarding complete" path (fresh completion,
 * /start, /menu, editBack) already runs through, so it doubles as a lazy
 * backfill for users who onboarded before EPIC 3 shipped.
 */
export async function sendMainMenu(ctx: BotContext): Promise<void> {
  await getOrCreatePreference(ctx.internalUser);
  await ctx.reply(MAIN_MENU_MESSAGE, { reply_markup: mainMenuKeyboard() });
}

/**
 * Registers the full EPIC 2 onboarding & profile-edit flow (US-2.1..2.7).
 * Required steps (age gate, gender, birth date) are always resumable purely
 * from persisted User fields via deriveOnboardingStep — see CLAUDE.md's data
 * model note on why there's no separate "onboarding complete" flag. Optional
 * steps (bio, interests, photo) and edit-profile only need the ephemeral
 * `awaitingInput` marker to know what a follow-up text/photo message means
 * and whether to chain onward (onboarding) or return to the edit menu (edit).
 */
export function registerOnboardingHandlers(bot: Bot<BotContext>, deps: OnboardingDeps): void {
  const { awaitingInput, miniAppUrl } = deps;

  /** Resumes at whichever required step is next; used by /start, /menu, and stale-tap recovery. */
  async function sendCurrentStepPrompt(ctx: BotContext): Promise<void> {
    const step = deriveOnboardingStep(ctx.internalUser);
    const userId = ctx.internalUser.id;
    switch (step) {
      case "age_gate":
        await ctx.reply(AGE_GATE_MESSAGE, { reply_markup: ageGateKeyboard() });
        return;
      case "gender":
        await ctx.reply(GENDER_PROMPT, { reply_markup: genderKeyboard() });
        return;
      case "birth_date":
        awaitingInput.set(userId, { field: "birth_date", mode: "onboarding" });
        await ctx.reply(BIRTH_DATE_PROMPT);
        return;
      case "complete":
        await sendMainMenu(ctx);
        return;
    }
  }

  async function startOptionalBioStep(ctx: BotContext): Promise<void> {
    awaitingInput.set(ctx.internalUser.id, { field: "bio", mode: "onboarding" });
    await ctx.reply(BIO_PROMPT, { reply_markup: bioSkipKeyboard() });
  }

  async function startOptionalInterestsStep(ctx: BotContext): Promise<void> {
    awaitingInput.set(ctx.internalUser.id, { field: "interests", mode: "onboarding" });
    await ctx.reply(INTERESTS_PROMPT, { reply_markup: interestsKeyboard(new Set()) });
  }

  async function startOptionalPhotoStep(ctx: BotContext): Promise<void> {
    awaitingInput.set(ctx.internalUser.id, { field: "photo", mode: "onboarding" });
    await ctx.reply(PHOTO_PROMPT, { reply_markup: photoSkipKeyboard() });
  }

  async function completeOnboarding(ctx: BotContext): Promise<void> {
    awaitingInput.clear(ctx.internalUser.id);
    const profile = await findProfileByUserId(ctx.internalUser.id);
    await ctx.reply(formatProfileSummary(ctx.internalUser, profile));
    await sendMainMenu(ctx);
  }

  async function handleBirthDateText(ctx: BotContext, text: string, mode: AwaitingMode): Promise<void> {
    const userId = ctx.internalUser.id;
    const parsed = parseBirthDateInput(text);
    if (!parsed.ok) {
      const message =
        parsed.reason === "invalid_format"
          ? BIRTH_DATE_INVALID_FORMAT_MESSAGE
          : parsed.reason === "future_date"
            ? BIRTH_DATE_FUTURE_MESSAGE
            : BIRTH_DATE_INVALID_DATE_MESSAGE;
      await ctx.reply(message);
      return;
    }

    if (!isAdult(parsed.birthDate)) {
      if (mode === "onboarding") {
        awaitingInput.clear(userId);
        await ctx.reply(BIRTH_DATE_UNDERAGE_ONBOARDING_MESSAGE);
      } else {
        await ctx.reply(BIRTH_DATE_UNDERAGE_EDIT_MESSAGE);
      }
      return;
    }

    const updated = await updateUser(userId, { birthDate: parsed.birthDate });
    ctx.internalUser = updated;
    awaitingInput.clear(userId);
    if (mode === "onboarding") {
      // birth_date is the last required step (deriveOnboardingStep is now
      // "complete") — create the default MatchPreference right here rather
      // than waiting for sendMainMenu, which isn't reached until the
      // optional bio/interests/photo chain finishes. Without this, EPIC 3's
      // candidate query (which requires a MatchPreference row to exist)
      // would silently exclude this user from everyone else's search during
      // that window.
      await getOrCreatePreference(updated);
      await startOptionalBioStep(ctx);
    } else {
      await ctx.reply(BIRTH_DATE_SAVED_MESSAGE);
      await ctx.reply(EDIT_MENU_MESSAGE, { reply_markup: editMenuKeyboard() });
    }
  }

  async function handleBioText(ctx: BotContext, text: string, mode: AwaitingMode): Promise<void> {
    const userId = ctx.internalUser.id;
    if (text.length > BIO_MAX_LENGTH) {
      await ctx.reply(bioTooLongMessage(text.length));
      return;
    }

    // Bio profanity/keyword filtering is EPIC 5 scope (not built yet) — only
    // the length rule is enforced here for now.
    await upsertProfile(userId, { displayBio: text });
    awaitingInput.clear(userId);
    if (mode === "onboarding") {
      await startOptionalInterestsStep(ctx);
    } else {
      await ctx.reply(BIO_SAVED_MESSAGE);
      await ctx.reply(EDIT_MENU_MESSAGE, { reply_markup: editMenuKeyboard() });
    }
  }

  bot.command("start", async (ctx) => {
    const step = deriveOnboardingStep(ctx.internalUser);
    if (step === "complete") {
      await sendMainMenu(ctx);
      return;
    }
    if (step === "age_gate") {
      await ctx.reply(WELCOME_MESSAGE, { reply_markup: onboardingBeginKeyboard() });
      // miniAppKeyboard degrades to a plain URL button when miniAppUrl isn't
      // HTTPS yet (Telegram rejects non-HTTPS `web_app` buttons outright) —
      // see its doc comment in keyboards.ts.
      await ctx.reply(MINI_APP_INTRO_MESSAGE, { reply_markup: miniAppKeyboard(miniAppUrl) });
      return;
    }
    // Returning user mid-onboarding (US-2.1): resume exactly where they left off.
    await sendCurrentStepPrompt(ctx);
  });

  bot.command("menu", async (ctx) => {
    await sendCurrentStepPrompt(ctx);
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // Defense in depth: callback_data can in principle be forged/replayed by
    // a non-standard client independently of which buttons the bot actually
    // showed. Every other required-field guarantee (age gate, isAdult() on
    // birth date) holds regardless, but without this, an unattested user
    // could still get gender/bio/interests/photo written before confirming
    // 18+ — refuse any onboarding/edit action until the age gate is passed.
    const AGE_GATE_EXEMPT_DATA = new Set<string>([CB.onboardingBegin, CB.ageYes, CB.ageNo]);
    if (!ctx.internalUser.ageAttestedAt && !AGE_GATE_EXEMPT_DATA.has(data)) {
      await ctx.answerCallbackQuery();
      await ctx.reply(AGE_GATE_MESSAGE, { reply_markup: ageGateKeyboard() });
      return;
    }

    if (data === CB.onboardingBegin) {
      await ctx.answerCallbackQuery();
      if (ctx.internalUser.ageAttestedAt) {
        await sendCurrentStepPrompt(ctx);
        return;
      }
      await ctx.reply(AGE_GATE_MESSAGE, { reply_markup: ageGateKeyboard() });
      return;
    }

    if (data === CB.ageYes) {
      if (ctx.internalUser.ageAttestedAt) {
        await ctx.answerCallbackQuery();
        await sendCurrentStepPrompt(ctx);
        return;
      }
      const updated = await updateUser(ctx.internalUser.id, { ageAttestedAt: new Date() });
      ctx.internalUser = updated;
      await ctx.answerCallbackQuery();
      await sendCurrentStepPrompt(ctx);
      return;
    }

    if (data === CB.ageNo) {
      await ctx.answerCallbackQuery();
      await ctx.reply(AGE_GATE_CANCELLED_MESSAGE);
      return;
    }

    if (data.startsWith("gender:")) {
      const value = data.slice("gender:".length);
      if (!isGenderValue(value)) {
        await ctx.answerCallbackQuery();
        return;
      }
      if (ctx.internalUser.gender === value) {
        // Idempotent duplicate/stale tap (the value's already saved) — don't
        // re-derive "was this onboarding or edit" from a gender field that a
        // prior delivery of this same event already flipped to non-null.
        await ctx.answerCallbackQuery();
        await sendCurrentStepPrompt(ctx);
        return;
      }
      const wasOnboarding = ctx.internalUser.gender === null;
      const updated = await updateUser(ctx.internalUser.id, { gender: value });
      ctx.internalUser = updated;
      await ctx.answerCallbackQuery({ text: GENDER_SAVED_MESSAGE });
      if (wasOnboarding) {
        await sendCurrentStepPrompt(ctx);
      } else {
        await ctx.reply(EDIT_MENU_MESSAGE, { reply_markup: editMenuKeyboard() });
      }
      return;
    }

    if (data === CB.bioSkip) {
      awaitingInput.clear(ctx.internalUser.id);
      await ctx.answerCallbackQuery();
      await startOptionalInterestsStep(ctx);
      return;
    }

    if (data.startsWith("int:t:")) {
      const value = data.slice("int:t:".length);
      const currentSelected = new Set(getSelectedInterests(getMessageInlineKeyboard(ctx)));
      const nextSelected = toggleInterest(currentSelected, value);
      if (setsAreEqual(currentSelected, nextSelected)) {
        // toggleInterest no-ops at MAX_INTERESTS — re-rendering an
        // unchanged keyboard would make Telegram reject the edit with
        // "message is not modified", so tell the user why instead.
        await ctx.answerCallbackQuery({ text: INTERESTS_CAP_REACHED_MESSAGE, show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: interestsKeyboard(nextSelected) });
      return;
    }

    if (data === CB.interestsDone || data === CB.interestsSkip) {
      const userId = ctx.internalUser.id;
      const awaiting = awaitingInput.get(userId);
      if (awaiting && awaiting.field !== "interests") {
        // Stale/duplicate tap: awaitingInput now points at a later step
        // (e.g. photo), meaning a prior delivery of this same tap already
        // advanced the flow — ignore instead of re-deriving the wrong mode
        // from unrelated state. (A missing/expired entry is NOT this case —
        // it falls through to the edit-mode default below, same as before.)
        await ctx.answerCallbackQuery();
        return;
      }
      const mode = awaiting?.mode ?? "edit";
      if (data === CB.interestsDone) {
        const selected = getSelectedInterests(getMessageInlineKeyboard(ctx));
        await upsertProfile(userId, { interests: selected });
      }
      awaitingInput.clear(userId);
      await ctx.answerCallbackQuery(data === CB.interestsDone ? { text: INTERESTS_SAVED_MESSAGE } : undefined);
      if (mode === "onboarding") {
        await startOptionalPhotoStep(ctx);
      } else {
        await ctx.reply(EDIT_MENU_MESSAGE, { reply_markup: editMenuKeyboard() });
      }
      return;
    }

    if (data === CB.photoSkip) {
      awaitingInput.clear(ctx.internalUser.id);
      await ctx.answerCallbackQuery();
      await completeOnboarding(ctx);
      return;
    }

    if (data === CB.editCancel) {
      awaitingInput.clear(ctx.internalUser.id);
      await ctx.answerCallbackQuery();
      await ctx.reply(EDIT_MENU_MESSAGE, { reply_markup: editMenuKeyboard() });
      return;
    }

    if (data === CB.menuEdit) {
      awaitingInput.clear(ctx.internalUser.id);
      await ctx.answerCallbackQuery();
      await ctx.reply(EDIT_MENU_MESSAGE, { reply_markup: editMenuKeyboard() });
      return;
    }

    if (data === CB.editBack) {
      awaitingInput.clear(ctx.internalUser.id);
      await ctx.answerCallbackQuery();
      // Routes through the required-step check (like /menu) rather than
      // straight to the main menu, for defense-in-depth consistency.
      await sendCurrentStepPrompt(ctx);
      return;
    }

    if (data === CB.editGender) {
      await ctx.answerCallbackQuery();
      await ctx.reply(GENDER_PROMPT, { reply_markup: genderEditKeyboard() });
      return;
    }

    if (data === CB.editBirthDate) {
      awaitingInput.set(ctx.internalUser.id, { field: "birth_date", mode: "edit" });
      await ctx.answerCallbackQuery();
      await ctx.reply(BIRTH_DATE_EDIT_PROMPT, { reply_markup: editCancelKeyboard() });
      return;
    }

    if (data === CB.editBio) {
      awaitingInput.set(ctx.internalUser.id, { field: "bio", mode: "edit" });
      await ctx.answerCallbackQuery();
      await ctx.reply(BIO_EDIT_PROMPT, { reply_markup: editCancelKeyboard() });
      return;
    }

    if (data === CB.editInterests) {
      awaitingInput.set(ctx.internalUser.id, { field: "interests", mode: "edit" });
      const profile = await findProfileByUserId(ctx.internalUser.id);
      await ctx.answerCallbackQuery();
      await ctx.reply(INTERESTS_PROMPT, {
        reply_markup: interestsKeyboard(new Set(profile?.interests ?? [])),
      });
      return;
    }

    if (data === CB.editPhoto) {
      awaitingInput.set(ctx.internalUser.id, { field: "photo", mode: "edit" });
      await ctx.answerCallbackQuery();
      await ctx.reply(PHOTO_EDIT_PROMPT, { reply_markup: editCancelKeyboard() });
      return;
    }

    // Not handled here — let a later-registered handler (e.g. matching.ts's
    // menu:find/settings/swipe/preferences callbacks) have a turn.
    await next();
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const userId = ctx.internalUser.id;
    const awaiting = awaitingInput.get(userId);

    const isBirthDateFallback = !awaiting && deriveOnboardingStep(ctx.internalUser) === "birth_date";
    if (awaiting?.field === "birth_date" || isBirthDateFallback) {
      await handleBirthDateText(ctx, text, awaiting?.mode ?? "onboarding");
      return;
    }

    if (awaiting?.field === "bio") {
      await handleBioText(ctx, text, awaiting.mode);
      return;
    }

    if (awaiting?.field === "photo") {
      await ctx.reply(awaiting.mode === "onboarding" ? PHOTO_EXPECTED_MESSAGE : PHOTO_EXPECTED_EDIT_MESSAGE);
      return;
    }

    if (awaiting?.field === "interests") {
      await ctx.reply(INTERESTS_EXPECTED_MESSAGE);
      return;
    }

    if (awaiting?.field === "age_range") {
      // EPIC 3 (match preferences) territory — matching.ts owns this field.
      await next();
      return;
    }

    if (!awaiting && deriveOnboardingStep(ctx.internalUser) !== "complete") {
      await sendCurrentStepPrompt(ctx);
      return;
    }

    await ctx.reply(RESUME_NUDGE_MESSAGE);
  });

  bot.on("message:photo", async (ctx) => {
    const userId = ctx.internalUser.id;
    const awaiting = awaitingInput.get(userId);
    if (awaiting?.field !== "photo") {
      await ctx.reply(RESUME_NUDGE_MESSAGE);
      return;
    }

    const sizes = ctx.message.photo;
    const largest = sizes[sizes.length - 1];
    if (!largest) return;

    await upsertProfile(userId, { photoUrl: largest.file_id, photoModerationStatus: "pending" });
    awaitingInput.clear(userId);
    if (awaiting.mode === "onboarding") {
      await completeOnboarding(ctx);
    } else {
      await ctx.reply(PHOTO_SAVED_PENDING_MESSAGE);
      await ctx.reply(EDIT_MENU_MESSAGE, { reply_markup: editMenuKeyboard() });
    }
  });
}
