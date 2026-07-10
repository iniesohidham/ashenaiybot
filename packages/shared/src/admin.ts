// EPIC 7 (Admin Panel) domain constants — mirrors moderation.ts's pattern of
// keeping rate-limit thresholds as plain shared constants rather than
// DB-backed/env-configurable values, consistent with how the rest of the
// codebase treats these (SWIPE_RATE_LIMIT_PER_MINUTE, MESSAGE_RATE_LIMIT_PER_MINUTE).

// US-7.1's "failed login attempts are rate-limited to resist brute-force
// attempts" AC — a fixed window per username (see modules/admin/service.ts).
export const ADMIN_LOGIN_RATE_LIMIT_ATTEMPTS = 5;
export const ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

// A per-username limit alone never engages against an attacker who varies
// the attempted username on every request (each gets its own fresh Redis
// key) — an adversarial review caught this gap. This second, IP-keyed limit
// closes it; the threshold is looser than the per-username one since a
// shared office/NAT IP can legitimately host several admins failing their
// own passwords independently.
export const ADMIN_LOGIN_IP_RATE_LIMIT_ATTEMPTS = 20;

// US-7.1's "sessions expire after a configurable period of inactivity" AC.
// bot-api mints a signed API token at login with this absolute lifetime
// (lib/adminToken.ts); web-admin's own NextAuth cookie enforces the actual
// inactivity window with a shorter updateAge, sliding forward on activity —
// this is just the outer cap the inner token can never outlive.
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const ADMIN_SESSION_UPDATE_AGE_SECONDS = 60 * 60;

// US-7.7's "rate-limiting that respects Telegram's API limits, not sent all
// at once" AC — spacing between individual sendMessage calls in the
// send-broadcast worker job. Conservative relative to Telegram's ~30
// msg/sec global cap since these all target distinct chats.
export const BROADCAST_SEND_INTERVAL_MS = 50;
export const BROADCAST_MESSAGE_MAX_LENGTH = 2000;

// US-7.5's banned-pattern length cap — generous for a literal substring, not
// meant to hold arbitrary prose.
export const BANNED_PATTERN_MAX_LENGTH = 200;

// US-7.4's ban-issue form — how many days out a temporary ban's expiresAt is
// set when the admin doesn't override it (mirrors resolveReport()'s existing
// hardcoded 7-day default in modules/moderation/service.ts).
export const DEFAULT_BAN_DURATION_DAYS = 7;
export const MAX_BAN_DURATION_DAYS = 365;

// US-7.4 ban reason / US-5.3 resolution ban reason free-text cap.
export const BAN_REASON_MAX_LENGTH = 500;

// Hand-mirrored unions of Prisma's ReportResolutionAction/BanType/AdminRole
// enum values plus Persian labels — same pattern as moderation.ts's
// ReportReasonValue/REPORT_REASON_OPTIONS, so the Admin Panel's action/type
// dropdowns can't drift from what the backend actually accepts.
export type ReportResolutionActionValue = "no_action" | "warn" | "temporary_ban" | "permanent_ban";

export const REPORT_RESOLUTION_ACTION_OPTIONS: ReadonlyArray<{ value: ReportResolutionActionValue; labelFa: string }> = [
  { value: "no_action", labelFa: "بدون اقدام" },
  { value: "warn", labelFa: "اخطار" },
  { value: "temporary_ban", labelFa: "بن موقت" },
  { value: "permanent_ban", labelFa: "بن دائم" },
];

export type BanTypeValue = "temporary" | "permanent";

export const BAN_TYPE_OPTIONS: ReadonlyArray<{ value: BanTypeValue; labelFa: string }> = [
  { value: "temporary", labelFa: "موقت" },
  { value: "permanent", labelFa: "دائم" },
];

export type AdminRoleValue = "admin" | "moderator";
