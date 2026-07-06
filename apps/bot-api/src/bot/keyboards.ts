import { InlineKeyboard } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { GENDER_OPTIONS, INTEREST_OPTIONS, MAX_INTERESTS, type GenderValue } from "@ashena/shared";
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
  MINI_APP_BUTTON_LABEL,
  ONBOARDING_BEGIN_LABEL,
  PHOTO_SKIP_LABEL,
} from "./copy.js";

// Callback-data conventions used across onboarding.ts. Keeping the string
// constants next to the keyboards that produce them so the two can't drift.
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
} as const;

const INTEREST_TOGGLE_PREFIX = "int:t:";
const SELECTED_MARK = "✅ ";
const UNSELECTED_MARK = "⬜️ ";

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

export function miniAppKeyboard(url: string): InlineKeyboard {
  return new InlineKeyboard().webApp(MINI_APP_BUTTON_LABEL, url);
}

export function onboardingBeginKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(ONBOARDING_BEGIN_LABEL, CB.onboardingBegin);
}

/** Escape hatch shown on edit-profile text/photo prompts (no meaningful "skip" there). */
export function editCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(EDIT_CANCEL_LABEL, CB.editCancel);
}
