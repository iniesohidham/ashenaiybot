import { GENDER_OPTIONS, INTEREST_OPTIONS, REPORT_REASON_OPTIONS } from "@ashena/shared";

/**
 * Mini App Persian copy (EPIC 6). Option *values* come straight from
 * @ashena/shared (GENDER_OPTIONS/INTEREST_OPTIONS/REPORT_REASON_OPTIONS) so
 * this surface can't drift from the bot's fixed value lists — see G5
 * dual-surface parity. Everything else is its own copy, but follows the
 * same PRD §8 tone rules apps/bot-api/src/bot/copy.ts documents: CTAs start
 * with a verb and state the outcome, errors state what+why+how-to-fix,
 * sensitive dialogs spell out consequences, and the chat counterpart is
 * always "هم‌صحبت" — never "پارتنر".
 */

export { GENDER_OPTIONS, INTEREST_OPTIONS, REPORT_REASON_OPTIONS };

export const NAV_LABELS = {
  swipe: "کشف",
  chat: "گفتگو",
  profile: "پروفایل",
  settings: "تنظیمات",
};

export const OUTSIDE_TELEGRAM_TITLE = "این صفحه فقط داخل تلگرام کار می‌کنه";
export const OUTSIDE_TELEGRAM_BODY =
  "برای استفاده از آشنایی، این مینی‌اپ رو از داخل ربات @ashenaiybot در تلگرام باز کن.";

export const ACCOUNT_INACTIVE_TITLE = "این حساب در دسترس نیست";
export const ACCOUNT_INACTIVE_BODY = "امکان استفاده از آشنایی با این حساب وجود نداره.";

export const GENERIC_ERROR_MESSAGE = "یه مشکلی پیش اومد. یه لحظه صبر کن و دوباره امتحان کن.";
export const LOADING_MESSAGE = "در حال بارگذاری…";

// --- Swipe deck (US-6.4) ----------------------------------------------------
export const SWIPE_EMPTY_TITLE = "فعلاً کسی برای نشون دادن نیست";
export const SWIPE_EMPTY_BODY = "بعداً دوباره سر بزن — کاربرهای جدید مدام اضافه می‌شن.";
export const SWIPE_LIKE_LABEL = "پسندیدم";
export const SWIPE_PASS_LABEL = "رد کن";
export const SWIPE_MATCH_TITLE = "یه Match جدید داری! 🎉";
export const SWIPE_MATCH_BODY = "هر دوتون همدیگه رو پسندیدید. می‌تونی الان گفتگو رو شروع کنی.";
export const SWIPE_START_CHAT_LABEL = "شروع گفتگو";
export const SWIPE_KEEP_BROWSING_LABEL = "ادامه‌ی کشف";
export const SWIPE_CANDIDATE_EXPIRED_MESSAGE = "این کارت دیگه معتبر نیست — کارت بعدی رو بگیر.";
export const SWIPE_RATE_LIMITED_MESSAGE = "خیلی سریع داری رد می‌کنی. یه لحظه صبر کن.";

// --- Profile (US-6.3) --------------------------------------------------------
export const PROFILE_TITLE = "پروفایل من";
export const PROFILE_SAVE_LABEL = "ذخیره‌ی پروفایل";
export const PROFILE_SAVED_MESSAGE = "پروفایلت ذخیره شد.";
export const PROFILE_BIO_LABEL = "درباره‌ی من";
export const PROFILE_INTERESTS_LABEL = "علایق";
export const PROFILE_GENDER_LABEL = "جنسیت";
export const PROFILE_BIRTH_DATE_LABEL = "تاریخ تولد";
export const PROFILE_PHOTO_LABEL = "عکس پروفایل";
export const PROFILE_PHOTO_UPLOAD_LABEL = "آپلود عکس";
export const PROFILE_PHOTO_PENDING_MESSAGE = "عکست در حال بررسیه…";
export const PROFILE_PHOTO_REJECTED_MESSAGE = "عکس قبلی تأیید نشد. یه عکس دیگه آپلود کن.";
export const PROFILE_PHOTO_APPROVED_MESSAGE = "عکست تأیید شده.";

// --- Chat (US-6.5) -----------------------------------------------------------
export const CHAT_EMPTY_TITLE = "گفتگوی فعالی نداری";
export const CHAT_EMPTY_BODY = "از بخش کشف با یکی Match کن تا گفتگو شروع بشه.";
export const CHAT_SEND_LABEL = "ارسال";
export const CHAT_INPUT_PLACEHOLDER = "پیامت رو بنویس…";
export const CHAT_END_LABEL = "پایان گفتگو";
export const CHAT_END_CONFIRM_TITLE = "گفتگو رو تموم می‌کنی؟";
export const CHAT_END_CONFIRM_BODY = "این گفتگو با هم‌صحبتت بسته می‌شه.";
export const CHAT_REPORT_LABEL = "گزارش";
export const CHAT_REPORT_TITLE = "چرا می‌خوای گزارش بدی؟";
export const CHAT_REPORT_SUBMITTED_MESSAGE = "گزارشت ثبت شد و بررسی می‌شه.";
export const CHAT_BLOCK_LABEL = "بلاک";
export const CHAT_BLOCK_CONFIRM_TITLE = "این هم‌صحبت رو بلاک می‌کنی؟";
export const CHAT_BLOCK_CONFIRM_BODY = "دیگه پیامی از این فرد نمی‌بینی و گفتگو بسته می‌شه. این کار به هم‌صحبتت اطلاع داده نمی‌شه.";
export const CHAT_BLOCK_DONE_MESSAGE = "بلاک شد.";
export const CHAT_MESSAGE_BLOCKED_MESSAGE = "این پیام به‌خاطر محتواش ارسال نشد.";
export const CHAT_RATE_LIMITED_MESSAGE = "خیلی سریع داری پیام می‌فرستی. یه لحظه صبر کن.";
export const CHAT_PARTNER_LEFT_MESSAGE = "هم‌صحبتت از گفتگو خارج شد.";

// --- Settings (US-6.6) --------------------------------------------------------
export const SETTINGS_TITLE = "تنظیمات";
export const SETTINGS_PREFERENCES_TITLE = "ترجیحات جستجو";
export const SETTINGS_GENDER_PREF_LABEL = "علاقه‌مند به دیدن";
export const SETTINGS_AGE_RANGE_LABEL = "بازه‌ی سنی";
export const SETTINGS_SAVE_LABEL = "ذخیره‌ی ترجیحات";
export const SETTINGS_SAVED_MESSAGE = "ترجیحاتت ذخیره شد.";
export const SETTINGS_BLOCKED_TITLE = "کاربرهای بلاک‌شده";
export const SETTINGS_BLOCKED_EMPTY_MESSAGE = "کسی رو بلاک نکردی.";
export const SETTINGS_UNBLOCK_LABEL = "رفع بلاک";
export const SETTINGS_UNBLOCKED_MESSAGE = "رفع بلاک شد.";
export const SETTINGS_DELETE_ACCOUNT_LABEL = "حذف حساب";
export const SETTINGS_DELETE_CONFIRM_TITLE = "حسابت رو حذف می‌کنی؟";
export const SETTINGS_DELETE_CONFIRM_BODY =
  "با این کار پروفایل، عکس، و ترجیحاتت برای همیشه پاک می‌شه، گفتگوی فعالت (اگه داری) بسته می‌شه، و دیگه توی صف Match دیگران دیده نمی‌شی. این کار قابل بازگشت نیست.";
export const SETTINGS_DELETE_CONFIRM_ACTION_LABEL = "بله، حسابم رو حذف کن";
export const SETTINGS_DELETE_CANCEL_LABEL = "منصرف شدم";
export const SETTINGS_DELETED_MESSAGE = "حسابت حذف شد.";

// EPIC 8 (US-8.4) — inactivity-nudge opt-out, same field the bot's own
// settings menu toggles.
export const SETTINGS_NOTIFICATIONS_TITLE = "یادآوری‌ها";
export const SETTINGS_NOTIFICATIONS_TOGGLE_LABEL = "یادآوری غیرفعالی";
export const SETTINGS_NOTIFICATIONS_TOGGLE_DESCRIPTION =
  "اگه مدتی سر نزنی، یه پیام یادآوری دریافت می‌کنی.";
