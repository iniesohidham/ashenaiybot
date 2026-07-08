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
