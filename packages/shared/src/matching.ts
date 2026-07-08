// EPIC 3 (US-3.1, US-3.2) domain constants + pure helpers, shared between the
// bot's inline-keyboard matching flow and (eventually) the Mini App, per G5
// dual-surface parity — same reasoning as onboarding.ts.
import { MIN_AGE, normalizeDigits, type GenderValue } from "./onboarding.js";

export const DEFAULT_AGE_RANGE_SPREAD = 5;
export const MAX_PREFERENCE_AGE = 99;
export const SWIPE_RATE_LIMIT_PER_MINUTE = 20;

const ALL_GENDERS: GenderValue[] = ["male", "female", "other"];

/** "Opposite of declared gender, always overridable" (US-3.1) — "other" has no opposite, so defaults to everyone. */
export function defaultInterestedInGenders(gender: GenderValue | null): GenderValue[] {
  if (gender === "male") return ["female"];
  if (gender === "female") return ["male"];
  return [...ALL_GENDERS];
}

export function defaultAgeRange(age: number): { minAge: number; maxAge: number } {
  return {
    minAge: Math.max(MIN_AGE, age - DEFAULT_AGE_RANGE_SPREAD),
    maxAge: Math.min(MAX_PREFERENCE_AGE, age + DEFAULT_AGE_RANGE_SPREAD),
  };
}

export type AgeRangeParseResult =
  | { ok: true; minAge: number; maxAge: number }
  | { ok: false; reason: "invalid_format" | "out_of_bounds" | "min_after_max" };

/** Parses a guided text-input age range (e.g. "25-35"), Persian/Arabic-Indic digits normalized first. */
export function parseAgeRangeInput(text: string): AgeRangeParseResult {
  const match = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(normalizeDigits(text.trim()));
  if (!match) {
    return { ok: false, reason: "invalid_format" };
  }

  const minAge = Number(match[1]);
  const maxAge = Number(match[2]);
  if (minAge < MIN_AGE || minAge > MAX_PREFERENCE_AGE || maxAge < MIN_AGE || maxAge > MAX_PREFERENCE_AGE) {
    return { ok: false, reason: "out_of_bounds" };
  }
  if (minAge > maxAge) {
    return { ok: false, reason: "min_after_max" };
  }

  return { ok: true, minAge, maxAge };
}

function shiftYearsUTC(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Converts an [minAge, maxAge] range into birthDate bounds using the exact
 * same "today, N years back" boundary logic as calculateAge() — so a
 * candidate query built from these bounds always agrees with calculateAge()
 * on who's actually in range, without ever persisting a computed age.
 * Contract: candidate matches iff `minBirthDate < birthDate <= maxBirthDate`.
 */
export function birthDateBoundsForAgeRange(
  minAge: number,
  maxAge: number,
  now: Date = new Date(),
): { minBirthDate: Date; maxBirthDate: Date } {
  return {
    maxBirthDate: shiftYearsUTC(now, -minAge),
    minBirthDate: shiftYearsUTC(now, -(maxAge + 1)),
  };
}
