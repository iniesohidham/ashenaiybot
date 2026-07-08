import type { MatchPreference, Profile, User } from "@ashena/db";
import { BIO_MAX_LENGTH, GENDER_OPTIONS, INTEREST_OPTIONS, MAX_INTERESTS } from "@ashena/shared";

// Persian UX copy for EPIC 2 (bot onboarding & profile). Follows PRD §8:
// CTAs start with a verb, errors state what+why+how-to-fix, sensitive
// dialogs spell out consequences, and the counterpart is always
// "هم‌صحبت" — never varied.

export const WELCOME_MESSAGE =
  "به آشنایی خوش اومدی 👋 اینجا می‌تونی بدون این‌که کسی بفهمه تو کی هستی، با یه نفر جدید گپ بزنی. برای شروع، چند سؤال کوتاه ازت می‌پرسم.";

export const ONBOARDING_BEGIN_LABEL = "شروع ساخت پروفایل";

export const MINI_APP_INTRO_MESSAGE = "می‌خوای از حالت غنی (وب‌اپ) هم استفاده کنی؟";

export const EDIT_CANCEL_LABEL = "انصراف";

export const AGE_GATE_MESSAGE =
  "آشنایی فقط برای افراد بالای ۱۸ ساله. با ادامه، تأیید می‌کنی که ۱۸ سال یا بیشتر داری.";

export const AGE_GATE_CONFIRM_LABEL = "تأیید می‌کنم، ۱۸+ هستم";
export const AGE_GATE_CANCEL_LABEL = "انصراف";

export const AGE_GATE_CANCELLED_MESSAGE =
  "باشه، مشکلی نیست. آشنایی فقط برای افراد بالای ۱۸ ساله، پس فعلاً نمی‌تونیم پروفایلت رو بسازیم. هر وقت خواستی، با /start دوباره شروع کن.";

export const GENDER_PROMPT = "جنسیتت رو انتخاب کن:";

export const BIRTH_DATE_PROMPT_EXAMPLE = "2000-05-20";

export const BIRTH_DATE_PROMPT = `تاریخ تولدت رو به شکل سال-ماه-روز میلادی بفرست، مثلاً: ${BIRTH_DATE_PROMPT_EXAMPLE}`;

export const BIRTH_DATE_EDIT_PROMPT = `تاریخ تولد جدیدت رو به شکل سال-ماه-روز میلادی بفرست، مثلاً: ${BIRTH_DATE_PROMPT_EXAMPLE}`;

export const BIRTH_DATE_INVALID_FORMAT_MESSAGE = `این فرمت تاریخ رو نفهمیدم. لطفاً به شکل سال-ماه-روز میلادی بفرست، مثلاً: ${BIRTH_DATE_PROMPT_EXAMPLE}`;

export const BIRTH_DATE_INVALID_DATE_MESSAGE = `این یه تاریخ واقعی نیست. لطفاً دوباره به شکل سال-ماه-روز میلادی بفرست، مثلاً: ${BIRTH_DATE_PROMPT_EXAMPLE}`;

export const BIRTH_DATE_FUTURE_MESSAGE =
  "تاریخ تولد نمی‌تونه در آینده باشه. لطفاً دوباره بررسی کن و بفرست.";

export const BIRTH_DATE_UNDERAGE_ONBOARDING_MESSAGE =
  "با این تاریخ تولد، سنت زیر ۱۸ ساله. آشنایی فقط برای افراد بالای ۱۸ ساله در دسترسه، پس فعلاً نمی‌تونیم پروفایلت رو بسازیم. هر وقت خواستی، با /start دوباره شروع کن.";

export const BIRTH_DATE_UNDERAGE_EDIT_MESSAGE =
  "با این تاریخ تولد، سنت زیر ۱۸ ساله میشه، برای همین نتونستیم ثبتش کنیم. تاریخ تولد قبلیت دست‌نخورده موند. اگه اشتباه تایپی بود، دوباره امتحان کن.";

export const BIO_PROMPT_SKIP_LABEL = "رد شدن";

export const BIO_PROMPT = `دوست داری یه بیوی کوتاه درباره‌ی خودت بنویسی؟ (حداکثر ${BIO_MAX_LENGTH} کاراکتر) اگه دوست نداری، رد شو.`;

export const BIO_EDIT_PROMPT = `بیوی جدیدت رو بفرست (حداکثر ${BIO_MAX_LENGTH} کاراکتر).`;

export function bioTooLongMessage(actualLength: number): string {
  return `بیوت ${actualLength} کاراکتره، ولی حداکثر مجاز ${BIO_MAX_LENGTH} کاراکتره. لطفاً کوتاه‌ترش کن و دوباره بفرست.`;
}

export const INTERESTS_DONE_LABEL = "تمومه";
export const INTERESTS_SKIP_LABEL = "رد شدن";

export const INTERESTS_PROMPT = `چند تا از علاقه‌مندی‌هات رو انتخاب کن (حداکثر ${MAX_INTERESTS} تا)، بعد روی «${INTERESTS_DONE_LABEL}» بزن. اگه دوست نداری، رد شو.`;

export const INTERESTS_CAP_REACHED_MESSAGE = `حداکثر ${MAX_INTERESTS} تا علاقه‌مندی می‌تونی انتخاب کنی. یکی رو بردار تا بتونی یکی دیگه اضافه کنی.`;

export const PHOTO_SKIP_LABEL = "رد شدن";

export const PHOTO_PROMPT =
  "دوست داری یه عکس پروفایل هم اضافه کنی؟ قبل از این‌که به بقیه نشون داده بشه، بررسیش می‌کنیم. اگه دوست نداری، رد شو.";

export const PHOTO_EDIT_PROMPT =
  "عکس جدیدت رو بفرست. تا وقتی تأیید بشه، عکس قبلی نشون داده نمی‌شه.";

export const PHOTO_SAVED_PENDING_MESSAGE = "عکست ثبت شد و در انتظار بررسیه ✅";

export const PHOTO_REJECTED_MESSAGE =
  "این عکس معیارهای آشنایی رو نداره و منتشر نشد. لطفاً یه عکس دیگه بفرست یا بدون عکس ادامه بده.";

export const BIO_SAVED_MESSAGE = "بیوت ذخیره شد ✅";
export const BIRTH_DATE_SAVED_MESSAGE = "تاریخ تولدت به‌روزرسانی شد ✅";
export const GENDER_SAVED_MESSAGE = "جنسیتت ذخیره شد ✅";
export const INTERESTS_SAVED_MESSAGE = "علاقه‌مندی‌هات ذخیره شد ✅";

export const MAIN_MENU_FIND_MATCH_LABEL = "پیدا کردن هم‌صحبت";
export const MAIN_MENU_EDIT_PROFILE_LABEL = "ویرایش پروفایل";
export const MAIN_MENU_SETTINGS_LABEL = "تنظیمات";

export const MAIN_MENU_MESSAGE = "چیکار می‌خوای بکنی؟";

export const EDIT_MENU_MESSAGE = "کدوم بخش از پروفایلت رو می‌خوای ویرایش کنی؟";
export const EDIT_MENU_GENDER_LABEL = "جنسیت";
export const EDIT_MENU_BIRTH_DATE_LABEL = "تاریخ تولد";
export const EDIT_MENU_BIO_LABEL = "بیو";
export const EDIT_MENU_INTERESTS_LABEL = "علاقه‌مندی‌ها";
export const EDIT_MENU_PHOTO_LABEL = "عکس";
export const EDIT_MENU_BACK_LABEL = "بازگشت به منو";

export const RESUME_NUDGE_MESSAGE = "برای دیدن منوی اصلی، دستور /menu رو بفرست.";

export const PHOTO_EXPECTED_MESSAGE =
  "الان منتظر عکس پروفایلتم. یه عکس بفرست یا روی «رد شدن» بزن.";

export const PHOTO_EXPECTED_EDIT_MESSAGE = "الان منتظر عکس جدیدتم. یه عکس بفرست یا روی «انصراف» بزن.";

export const INTERESTS_EXPECTED_MESSAGE = "لطفاً از دکمه‌های بالا برای انتخاب علاقه‌مندی‌ها استفاده کن.";

export const MINI_APP_BUTTON_LABEL = "باز کردن آشنایی در حالت غنی";

const GENDER_LABELS: Record<string, string> = Object.fromEntries(
  GENDER_OPTIONS.map((option) => [option.value, option.labelFa]),
);

const INTEREST_LABELS: Record<string, string> = Object.fromEntries(
  INTEREST_OPTIONS.map((option) => [option.value, option.labelFa]),
);

export function formatProfileSummary(
  user: Pick<User, "gender">,
  profile: Pick<Profile, "displayBio" | "interests" | "photoUrl" | "photoModerationStatus"> | null,
): string {
  const genderLabel = user.gender ? (GENDER_LABELS[user.gender] ?? user.gender) : "ثبت نشده";
  const bioLabel = profile?.displayBio?.trim() ? profile.displayBio : "ثبت نشده";
  const interestsLabel = profile?.interests?.length
    ? profile.interests.map((value) => INTEREST_LABELS[value] ?? value).join("، ")
    : "ثبت نشده";
  const photoLabel = !profile?.photoUrl
    ? "ثبت نشده"
    : profile.photoModerationStatus === "approved"
      ? "تأیید شده"
      : profile.photoModerationStatus === "rejected"
        ? "رد شده"
        : "در انتظار بررسی";

  return [
    "پروفایلت آماده‌ست ✅",
    "",
    `جنسیت: ${genderLabel}`,
    `بیو: ${bioLabel}`,
    `علاقه‌مندی‌ها: ${interestsLabel}`,
    `عکس: ${photoLabel}`,
  ].join("\n");
}

// EPIC 3 (US-3.1..3.6) matching-engine copy.

export const SWIPE_LIKE_LABEL = "لایک ❤️";
export const SWIPE_PASS_LABEL = "رد کردن ✖️";

export const FIND_MATCH_EMPTY_MESSAGE =
  "فعلاً هم‌صحبت مناسبی برات پیدا نکردیم. یکم بعد دوباره سر بزن.";

export const SWIPE_RATE_LIMITED_MESSAGE = "یکم تند رفتی! چند لحظه صبر کن و دوباره امتحان کن.";

export const SWIPE_CARD_EXPIRED_MESSAGE =
  "این کارت دیگه معتبر نیست. برای دیدن هم‌صحبت بعدی، دوباره روی «پیدا کردن هم‌صحبت» بزن.";

export const MATCH_FOUND_MESSAGE = "Match پیدا شد! 🎉 یه هم‌صحبت جدید داری.";
export const MATCH_START_CHAT_LABEL = "شروع گفتگو";
export const CHAT_START_PLACEHOLDER_MESSAGE = "شروع گفتگو هنوز آماده نیست — به‌زودی اضافه می‌شه.";

export const SETTINGS_MENU_MESSAGE = "چی رو می‌خوای تنظیم کنی؟";
export const SETTINGS_EDIT_GENDERS_LABEL = "جنسیت مورد علاقه";
export const SETTINGS_EDIT_AGE_RANGE_LABEL = "محدوده سنی";
export const SETTINGS_BACK_LABEL = "بازگشت به منو";

export const PREF_GENDER_PROMPT = "دنبال چه جنسیتی می‌گردی؟ (حداقل یکی رو انتخاب کن)";
export const PREF_GENDER_DONE_LABEL = "تمومه";
export const PREF_GENDER_MIN_REQUIRED_MESSAGE = "باید حداقل یک جنسیت انتخاب‌شده باقی بمونه.";
export const PREF_GENDER_SAVED_MESSAGE = "جنسیت مورد علاقه‌ات ذخیره شد ✅";

export const PREF_AGE_RANGE_PROMPT_EXAMPLE = "25-35";
export const PREF_AGE_RANGE_PROMPT = `محدوده سنی مورد نظرت رو به شکل حداقل-حداکثر بفرست، مثلاً: ${PREF_AGE_RANGE_PROMPT_EXAMPLE}`;
export const PREF_AGE_RANGE_INVALID_FORMAT_MESSAGE = `این فرمت رو نفهمیدم. لطفاً به شکل حداقل-حداکثر بفرست، مثلاً: ${PREF_AGE_RANGE_PROMPT_EXAMPLE}`;
export const PREF_AGE_RANGE_OUT_OF_BOUNDS_MESSAGE = "سن باید بین ۱۸ تا ۹۹ باشه. لطفاً دوباره بفرست.";
export const PREF_AGE_RANGE_MIN_AFTER_MAX_MESSAGE =
  "حداقل سن نمی‌تونه از حداکثر بیشتر باشه. لطفاً دوباره بفرست.";
export const PREF_AGE_RANGE_SAVED_MESSAGE = "محدوده سنی‌ات ذخیره شد ✅";

export function formatCandidateCard(
  profile: Pick<Profile, "displayBio" | "interests"> | null,
): string {
  const bioLabel = profile?.displayBio?.trim() ? profile.displayBio : "بیو ندارد";
  const interestsLabel = profile?.interests?.length
    ? profile.interests.map((value) => INTEREST_LABELS[value] ?? value).join("، ")
    : "علاقه‌مندی‌ای ثبت نشده";
  return [bioLabel, "", `علاقه‌مندی‌ها: ${interestsLabel}`].join("\n");
}

export function formatPreferenceSummary(
  preference: Pick<MatchPreference, "interestedInGenders" | "minAge" | "maxAge">,
): string {
  const gendersLabel = preference.interestedInGenders
    .map((value) => GENDER_LABELS[value] ?? value)
    .join("، ");
  return [
    `جنسیت مورد علاقه: ${gendersLabel}`,
    `محدوده سنی: ${preference.minAge} تا ${preference.maxAge}`,
  ].join("\n");
}
