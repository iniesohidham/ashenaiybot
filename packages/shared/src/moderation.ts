// EPIC 4/5 (US-4.5, US-5.1) domain constants — mirrors onboarding.ts's
// GenderValue/GENDER_OPTIONS pattern: a hand-mirrored union of Prisma's
// ReportReason enum values plus Persian labels, shared between the bot's
// inline report-reason keyboard and (eventually) the Admin Panel's report
// triage UI so the fixed reason list can't drift between surfaces.

export type ReportReasonValue = "harassment" | "unwanted_content" | "suspected_minor" | "spam" | "other";

export const REPORT_REASON_OPTIONS: ReadonlyArray<{ value: ReportReasonValue; labelFa: string }> = [
  { value: "harassment", labelFa: "آزار و اذیت" },
  { value: "unwanted_content", labelFa: "محتوای ناخواسته" },
  { value: "suspected_minor", labelFa: "احتمال زیر سن قانونی" },
  { value: "spam", labelFa: "اسپم" },
  { value: "other", labelFa: "دلیل دیگه" },
];

const REPORT_REASON_VALUES = new Set<string>(REPORT_REASON_OPTIONS.map((option) => option.value));

export function isReportReasonValue(value: string): value is ReportReasonValue {
  return REPORT_REASON_VALUES.has(value);
}

// EPIC 5/7 — same pattern as ReportReasonValue above, for the other fixed
// two-value enum this domain has (BannedPattern.severity, Report.severity).
// Added in EPIC 7 so the banned-pattern management UI's severity dropdown
// can't drift from what the backend accepts, the same reason
// ReportReasonValue exists.
export type ReportSeverityValue = "normal" | "high";

export const REPORT_SEVERITY_OPTIONS: ReadonlyArray<{ value: ReportSeverityValue; labelFa: string }> = [
  { value: "normal", labelFa: "عادی" },
  { value: "high", labelFa: "شدید" },
];

// EPIC 5 (US-5.6) — message-level rate limiting & spam detection constants.
// Mirrors matching.ts's SWIPE_RATE_LIMIT_PER_MINUTE: a plain shared constant
// rather than a DB-backed/env-configurable value, consistent with how the
// codebase already treats rate-limit thresholds (only the banned-word LIST
// itself needs to be DB-backed/deploy-free per US-5.1's AC).
export const MESSAGE_RATE_LIMIT_PER_MINUTE = 20;

// A sender's identical text content appearing in this many distinct
// ChatSessions within SPAM_DETECTION_WINDOW_MINUTES flags them for review
// (US-5.6's AC example: "identical message sent to many different matches").
export const SPAM_DUPLICATE_SESSION_THRESHOLD = 3;
export const SPAM_DETECTION_WINDOW_MINUTES = 10;

// EPIC 5 (US-5.5) — ban appeal free-text length cap ("free text, limited length").
export const BAN_APPEAL_MAX_LENGTH = 500;
