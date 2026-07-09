import { z } from "zod";
import { REPORT_REASON_OPTIONS, type ReportReasonValue } from "../moderation.js";

// Mirrors the bot's report-reason inline keyboard (EPIC 4, US-4.5) so the
// Mini App's report dialog (EPIC 6, US-6.5) can't submit a reason the bot
// side wouldn't also accept — see G5 dual-surface parity. Cast (not just
// `as [string, ...string[]]`) so z.enum's inferred type stays the literal
// ReportReasonValue union rather than widening to `string` — callers that
// feed this straight into fileReport()'s `ReportReason` parameter need that.
const REPORT_REASON_VALUES = REPORT_REASON_OPTIONS.map((option) => option.value) as [
  ReportReasonValue,
  ...ReportReasonValue[],
];

export const fileReportSchema = z.object({
  reason: z.enum(REPORT_REASON_VALUES),
});

export type FileReportInput = z.infer<typeof fileReportSchema>;
