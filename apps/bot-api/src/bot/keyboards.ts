import { InlineKeyboard } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { GENDER_OPTIONS, INTEREST_OPTIONS, isGenderValue, MAX_INTERESTS, type GenderValue } from "@ashena/shared";
import type { BotContext } from "./context.js";
import {
  AGE_GATE_CANCEL_LABEL,
  AGE_GATE_CONFIRM_LABEL,
  BIO_PROMPT_SKIP_LABEL,
  EDIT_CANCEL_LABEL,
  EDIT_MENU_BACK_LABEL,
  EDIT_MENU_BIO_LABEL,
  EDIT_MENU_BIRTH_DATE_LABEL,
  EDIT_MENU_GENDER_LABEL,
  EDIT_MENU_INTERESTS_LABEL,
  EDIT_MENU_PHOTO_LABEL,
  INTERESTS_DONE_LABEL,
  INTERESTS_SKIP_LABEL,
  MAIN_MENU_EDIT_PROFILE_LABEL,
  MAIN_MENU_FIND_MATCH_LABEL,
  MAIN_MENU_SETTINGS_LABEL,
  MATCH_START_CHAT_LABEL,
  MINI_APP_BUTTON_LABEL,
  ONBOARDING_BEGIN_LABEL,
  PHOTO_SKIP_LABEL,
  PREF_GENDER_DONE_LABEL,
  SETTINGS_BACK_LABEL,
  SETTINGS_EDIT_AGE_RANGE_LABEL,
  SETTINGS_EDIT_GENDERS_LABEL,
  SWIPE_LIKE_LABEL,
  SWIPE_PASS_LABEL,
} from "./copy.js";

// Callback-data conventions used across onboarding.ts/matching.ts. Keeping
// the string constants next to the keyboards that produce them so the two
// can't drift.
export const CB = {
  ageYes: "age:yes",
  ageNo: "age:no",
  gender: (value: GenderValue): string => `gender:${value}`,
  bioSkip: "bio:skip",
  interestToggle: (value: string): string => `int:t:${value}`,
  interestsDone: "int:done",
  interestsSkip: "int:skip",
  photoSkip: "photo:skip",
  menuFind: "menu:find",
  menuEdit: "menu:edit",
  menuSettings: "menu:settings",
  editGender: "edit:gender",
  editBirthDate: "edit:birthdate",
  editBio: "edit:bio",
  editInterests: "edit:interests",
  editPhoto: "edit:photo",
  editBack: "edit:back",
  editCancel: "edit:cancel",
  onboardingBegin: "onboarding:begin",
  swipeLike: (candidateId: string): string => `swipe:like:${candidateId}`,
  swipePass: (candidateId: string): string => `swipe:pass:${candidateId}`,
  browseBack: "browse:back",
  settingsBack: "settings:back",
  prefEditGenders: "pref:edit:genders",
  prefEditAgeRange: "pref:edit:age",
  prefGenderToggle: (value: GenderValue): string => `pref:gender:t:${value}`,
  prefGenderDone: "pref:gender:done",
  prefCancel: "pref:cancel",
  matchStart: (matchId: string): string => `match:start:${matchId}`,
} as const;

const SWIPE_LIKE_PREFIX = "swipe:like:";
const SWIPE_PASS_PREFIX = "swipe:pass:";
const PREF_GENDER_TOGGLE_PREFIX = "pref:gender:t:";
const MATCH_START_PREFIX = "match:start:";

export function candidateSwipeId(data: string): { candidateId: string; isLike: boolean } | null {
  if (data.startsWith(SWIPE_LIKE_PREFIX)) {
    return { candidateId: data.slice(SWIPE_LIKE_PREFIX.length), isLike: true };
  }
  if (data.startsWith(SWIPE_PASS_PREFIX)) {
    return { candidateId: data.slice(SWIPE_PASS_PREFIX.length), isLike: false };
  }
  return null;
}

export function matchIdFromStartCallback(data: string): string | null {
  return data.startsWith(MATCH_START_PREFIX) ? data.slice(MATCH_START_PREFIX.length) : null;
}

export function genderPreferenceToggleValue(data: string): GenderValue | null {
  if (!data.startsWith(PREF_GENDER_TOGGLE_PREFIX)) return null;
  const value = data.slice(PREF_GENDER_TOGGLE_PREFIX.length);
  return isGenderValue(value) ? value : null;
}

const INTEREST_TOGGLE_PREFIX = "int:t:";
const SELECTED_MARK = "✅ ";
const UNSELECTED_MARK = "⬜️ ";

/** Reads back the inline keyboard attached to the message a callback query fired from — used by any toggle-state-round-trips-through-the-message flow (interests, gender preferences). */
export function getMessageInlineKeyboard(ctx: BotContext): InlineKeyboardButton[][] | undefined {
  const message = ctx.callbackQuery?.message;
  if (!message || !("reply_markup" in message)) return undefined;
  return message.reply_markup?.inline_keyboard;
}

export function ageGateKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(AGE_GATE_CONFIRM_LABEL, CB.ageYes)
    .row()
    .text(AGE_GATE_CANCEL_LABEL, CB.ageNo);
}

export function genderKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const option of GENDER_OPTIONS) {
    keyboard.text(option.labelFa, CB.gender(option.value)).row();
  }
  return keyboard;
}

/** Same as genderKeyboard, plus an escape hatch — used for edit-profile only (onboarding's gender step is required, so there's nothing to cancel back to). */
export function genderEditKeyboard(): InlineKeyboard {
  return genderKeyboard().text(EDIT_CANCEL_LABEL, CB.editCancel);
}

export function bioSkipKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(BIO_PROMPT_SKIP_LABEL, CB.bioSkip);
}

/**
 * Selection state round-trips through the Telegram message itself (checkbox
 * glyph + callback data) instead of server-side session storage — toggling
 * just re-renders this same keyboard with a flipped Set.
 */
export function interestsKeyboard(selected: ReadonlySet<string>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  INTEREST_OPTIONS.forEach((option, index) => {
    const mark = selected.has(option.value) ? SELECTED_MARK : UNSELECTED_MARK;
    keyboard.text(`${mark}${option.labelFa}`, CB.interestToggle(option.value));
    if (index % 2 === 1) keyboard.row();
  });
  if (INTEREST_OPTIONS.length % 2 !== 0) keyboard.row();
  keyboard.text(INTERESTS_DONE_LABEL, CB.interestsDone).text(INTERESTS_SKIP_LABEL, CB.interestsSkip);
  return keyboard;
}

export function getSelectedInterests(rows: InlineKeyboardButton[][] | undefined): string[] {
  if (!rows) return [];
  const selected: string[] = [];
  for (const row of rows) {
    for (const button of row) {
      if (!("callback_data" in button) || !button.callback_data.startsWith(INTEREST_TOGGLE_PREFIX)) {
        continue;
      }
      if (button.text.startsWith(SELECTED_MARK)) {
        selected.push(button.callback_data.slice(INTEREST_TOGGLE_PREFIX.length));
      }
    }
  }
  return selected;
}

/** Toggles `value` in `selected`, silently ignoring attempts past MAX_INTERESTS. */
export function toggleInterest(selected: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(selected);
  if (next.has(value)) {
    next.delete(value);
  } else if (next.size < MAX_INTERESTS) {
    next.add(value);
  }
  return next;
}

/**
 * Telegram rejects editMessageReplyMarkup with a byte-identical keyboard
 * ("message is not modified"). toggleInterest() intentionally no-ops at the
 * MAX_INTERESTS cap, so callers must check this before re-rendering.
 */
export function setsAreEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export function photoSkipKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(PHOTO_SKIP_LABEL, CB.photoSkip);
}

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(MAIN_MENU_FIND_MATCH_LABEL, CB.menuFind)
    .row()
    .text(MAIN_MENU_EDIT_PROFILE_LABEL, CB.menuEdit)
    .row()
    .text(MAIN_MENU_SETTINGS_LABEL, CB.menuSettings);
}

export function editMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(EDIT_MENU_GENDER_LABEL, CB.editGender)
    .row()
    .text(EDIT_MENU_BIRTH_DATE_LABEL, CB.editBirthDate)
    .row()
    .text(EDIT_MENU_BIO_LABEL, CB.editBio)
    .row()
    .text(EDIT_MENU_INTERESTS_LABEL, CB.editInterests)
    .row()
    .text(EDIT_MENU_PHOTO_LABEL, CB.editPhoto)
    .row()
    .text(EDIT_MENU_BACK_LABEL, CB.editBack);
}

/**
 * Telegram rejects `web_app` buttons outright for non-HTTPS URLs (local dev,
 * or prod before certs are installed — see CLAUDE.md's ssl.conf.disabled
 * note). Degrade to a plain URL button rather than dropping the Mini App
 * mention entirely: it won't open as a native Mini App, but it's still a
 * working link and preserves the discovery path.
 */
export function miniAppKeyboard(url: string): InlineKeyboard {
  return url.startsWith("https://")
    ? new InlineKeyboard().webApp(MINI_APP_BUTTON_LABEL, url)
    : new InlineKeyboard().url(MINI_APP_BUTTON_LABEL, url);
}

export function onboardingBeginKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(ONBOARDING_BEGIN_LABEL, CB.onboardingBegin);
}

/** Escape hatch shown on edit-profile text/photo prompts (no meaningful "skip" there). */
export function editCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(EDIT_CANCEL_LABEL, CB.editCancel);
}

/** Candidate card actions (US-3.3, US-3.5) — the candidate id round-trips through the callback data itself, no separate server-side "current candidate" pointer needed for correctness. */
export function candidateCardKeyboard(candidateId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(SWIPE_LIKE_LABEL, CB.swipeLike(candidateId))
    .text(SWIPE_PASS_LABEL, CB.swipePass(candidateId))
    .row()
    .text(EDIT_MENU_BACK_LABEL, CB.browseBack);
}

export function settingsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(SETTINGS_EDIT_GENDERS_LABEL, CB.prefEditGenders)
    .row()
    .text(SETTINGS_EDIT_AGE_RANGE_LABEL, CB.prefEditAgeRange)
    .row()
    .text(SETTINGS_BACK_LABEL, CB.settingsBack);
}

/** Same round-trip-through-the-message technique as interestsKeyboard, with a floor of 1 selected gender instead of a MAX_INTERESTS-style cap. */
export function genderPreferenceKeyboard(selected: ReadonlySet<GenderValue>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const option of GENDER_OPTIONS) {
    const mark = selected.has(option.value) ? SELECTED_MARK : UNSELECTED_MARK;
    keyboard.text(`${mark}${option.labelFa}`, CB.prefGenderToggle(option.value)).row();
  }
  keyboard.text(PREF_GENDER_DONE_LABEL, CB.prefGenderDone);
  return keyboard;
}

export function getSelectedGenderPreferences(rows: InlineKeyboardButton[][] | undefined): GenderValue[] {
  if (!rows) return [];
  const selected: GenderValue[] = [];
  for (const row of rows) {
    for (const button of row) {
      if (!("callback_data" in button) || !button.callback_data.startsWith(PREF_GENDER_TOGGLE_PREFIX)) {
        continue;
      }
      if (button.text.startsWith(SELECTED_MARK)) {
        selected.push(button.callback_data.slice(PREF_GENDER_TOGGLE_PREFIX.length) as GenderValue);
      }
    }
  }
  return selected;
}

/** Toggles `value` in `selected`, refusing to drop below one selected gender (US-3.1 requires at least one). */
export function toggleGenderPreference(
  selected: ReadonlySet<GenderValue>,
  value: GenderValue,
): Set<GenderValue> {
  const next = new Set(selected);
  if (next.has(value)) {
    if (next.size > 1) next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

/** Escape hatch for the age-range edit prompt, mirroring editCancelKeyboard but returning to the settings menu instead of the edit-profile menu. */
export function prefCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(EDIT_CANCEL_LABEL, CB.prefCancel);
}

export function matchFoundKeyboard(matchId: string): InlineKeyboard {
  return new InlineKeyboard().text(MATCH_START_CHAT_LABEL, CB.matchStart(matchId));
}
