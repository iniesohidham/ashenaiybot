import { z } from "zod";
import {
  BAN_REASON_MAX_LENGTH,
  BANNED_PATTERN_MAX_LENGTH,
  BROADCAST_MESSAGE_MAX_LENGTH,
  BAN_TYPE_OPTIONS,
  MAX_BAN_DURATION_DAYS,
  REPORT_RESOLUTION_ACTION_OPTIONS,
  type BanTypeValue,
  type ReportResolutionActionValue,
} from "../admin.js";
import { REPORT_SEVERITY_OPTIONS, type ReportSeverityValue } from "../moderation.js";

const BAN_TYPE_VALUES = BAN_TYPE_OPTIONS.map((o) => o.value) as [BanTypeValue, ...BanTypeValue[]];
const REPORT_RESOLUTION_ACTION_VALUES = REPORT_RESOLUTION_ACTION_OPTIONS.map((o) => o.value) as [
  ReportResolutionActionValue,
  ...ReportResolutionActionValue[],
];
const REPORT_SEVERITY_VALUES = REPORT_SEVERITY_OPTIONS.map((o) => o.value) as [
  ReportSeverityValue,
  ...ReportSeverityValue[],
];
const BAN_APPEAL_OUTCOME_VALUES = ["upheld", "reversed"] as const;

export const adminLoginSchema = z.object({
  username: z.string().min(1, "نام کاربری الزامی است"),
  password: z.string().min(1, "رمز عبور الزامی است"),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// US-7.4 — issuing a ban directly from the user detail view, reusing EPIC
// 5's banUser() service. expiresInDays only applies when type="temporary"
// (modules/admin/service.ts ignores it for "permanent").
export const banUserSchema = z.object({
  type: z.enum(BAN_TYPE_VALUES),
  reason: z.string().min(1, "دلیل بن الزامی است").max(BAN_REASON_MAX_LENGTH),
  expiresInDays: z.coerce.number().int().positive().max(MAX_BAN_DURATION_DAYS).optional(),
});
export type BanUserInput = z.infer<typeof banUserSchema>;

// US-7.2 — resolving a report from the triage queue.
export const resolveReportSchema = z.object({
  action: z.enum(REPORT_RESOLUTION_ACTION_VALUES),
  banReason: z.string().min(1).max(BAN_REASON_MAX_LENGTH).optional(),
});
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

// US-5.5/7.2 — resolving a ban appeal from the same queue screen.
export const resolveBanAppealSchema = z.object({
  outcome: z.enum(BAN_APPEAL_OUTCOME_VALUES),
});
export type ResolveBanAppealInput = z.infer<typeof resolveBanAppealSchema>;

// US-7.5 — banned-word/pattern list CRUD.
export const upsertBannedPatternSchema = z.object({
  pattern: z.string().min(1, "الگو نمی‌تواند خالی باشد").max(BANNED_PATTERN_MAX_LENGTH),
  severity: z.enum(REPORT_SEVERITY_VALUES),
});
export type UpsertBannedPatternInput = z.infer<typeof upsertBannedPatternSchema>;

// US-7.7 — broadcast message tool.
export const broadcastMessageSchema = z.object({
  message: z.string().min(1, "متن پیام نمی‌تواند خالی باشد").max(BROADCAST_MESSAGE_MAX_LENGTH),
});
export type BroadcastMessageInput = z.infer<typeof broadcastMessageSchema>;
