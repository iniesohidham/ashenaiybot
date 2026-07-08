// EPIC 2 (US-2.2..2.4) domain constants + pure helpers, shared between the
// bot's inline-keyboard onboarding flow and the REST API's Zod validation so
// the two surfaces can never drift on the same rule (see PRD §7 "Validation"
// and G5 dual-surface parity).

export const MIN_AGE = 18;
export const BIO_MAX_LENGTH = 300;
export const MAX_INTERESTS = 5;

// Sanity floor for birth years, well below any plausible living user's birth
// year — rejects obviously garbage input (e.g. "0001-01-01") without trying
// to detect/convert other calendar systems.
const MIN_BIRTH_YEAR = 1900;

export type GenderValue = "male" | "female" | "other";

export const GENDER_OPTIONS: ReadonlyArray<{ value: GenderValue; labelFa: string }> = [
  { value: "male", labelFa: "مرد" },
  { value: "female", labelFa: "زن" },
  { value: "other", labelFa: "دیگر" },
];

const GENDER_VALUES = new Set<string>(["male", "female", "other"]);

export function isGenderValue(value: string): value is GenderValue {
  return GENDER_VALUES.has(value);
}

export const INTEREST_OPTIONS: ReadonlyArray<{ value: string; labelFa: string }> = [
  { value: "music", labelFa: "موسیقی" },
  { value: "movies", labelFa: "فیلم و سریال" },
  { value: "books", labelFa: "کتاب" },
  { value: "sport", labelFa: "ورزش" },
  { value: "travel", labelFa: "سفر" },
  { value: "gaming", labelFa: "بازی‌های ویدیویی" },
  { value: "art", labelFa: "هنر" },
  { value: "cooking", labelFa: "آشپزی" },
  { value: "nature", labelFa: "طبیعت‌گردی" },
  { value: "tech", labelFa: "فناوری" },
  { value: "pets", labelFa: "حیوان خانگی" },
  { value: "fitness", labelFa: "بدنسازی و تناسب‌اندام" },
];

export const INTEREST_VALUES = INTEREST_OPTIONS.map((option) => option.value) as [string, ...string[]];

/**
 * Derives age from a birth date at query time — never persist this (see
 * CLAUDE.md "No raw age storage").
 */
export function calculateAge(birthDate: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = now.getUTCDate() - birthDate.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

export type BirthDateParseResult =
  | { ok: true; birthDate: Date }
  | { ok: false; reason: "invalid_format" | "invalid_date" | "future_date" };

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Iranian users' keyboards commonly default to Persian digits, so a
// bare-ASCII regex would reject perfectly valid input from most of this
// product's actual audience.
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (char) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(char);
    if (persianIndex !== -1) return String(persianIndex);
    const arabicIndicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    return arabicIndicIndex !== -1 ? String(arabicIndicIndex) : char;
  });
}

/**
 * Parses a guided text-input birth date (US-2.3). Accepts Gregorian
 * `YYYY-MM-DD` or `YYYY/MM/DD` — a single unambiguous, dependency-free format
 * (no Jalali/other-calendar conversion attempted) — with Persian/Arabic-Indic
 * digits normalized to ASCII first.
 */
export function parseBirthDateInput(text: string, now: Date = new Date()): BirthDateParseResult {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(normalizeDigits(text.trim()));
  if (!match) {
    return { ok: false, reason: "invalid_format" };
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (year < MIN_BIRTH_YEAR) {
    return { ok: false, reason: "invalid_date" };
  }

  const birthDate = new Date(Date.UTC(year, month - 1, day));
  const isRealCalendarDate =
    birthDate.getUTCFullYear() === year &&
    birthDate.getUTCMonth() === month - 1 &&
    birthDate.getUTCDate() === day;
  if (!isRealCalendarDate) {
    return { ok: false, reason: "invalid_date" };
  }

  if (birthDate.getTime() > now.getTime()) {
    return { ok: false, reason: "future_date" };
  }

  return { ok: true, birthDate };
}

export function isAdult(birthDate: Date, now: Date = new Date()): boolean {
  return calculateAge(birthDate, now) >= MIN_AGE;
}
