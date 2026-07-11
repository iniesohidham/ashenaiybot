import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BOT_API_URL } from "@/lib/bot-api-url";

// EPIC 7 — server-side-only typed client for bot-api's routes/v1/admin/*.ts
// surface. Every call reads the current NextAuth session's apiToken (minted
// by bot-api at login, see auth.ts) and re-presents it as a Bearer token —
// this file must never be imported from a Client Component (the "server-only"
// import throws at build time if it is), since the token must never reach
// the browser.

export class AdminApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ErrorBody {
  error?: { code: string; message: string; fields?: Record<string, string> };
}

/**
 * bot-api mints the apiToken once at login with a fixed
 * ADMIN_SESSION_MAX_AGE_SECONDS expiry (see auth.ts) — but NextAuth's own
 * session cookie *rotates forward* on activity (its `updateAge`), so an
 * admin who stays active past that fixed window ends up with a cookie that
 * still says "logged in" while the token it's carrying is now expired. An
 * adversarial review caught that this then throws unhandled on every single
 * page (no error.tsx anywhere catches it, and there's no reliable way to
 * distinguish a 401 from other errors once Next.js redacts server errors
 * passed to a client error boundary in production). Redirecting centrally
 * here — the one place that actually sees the 401 — sidesteps that
 * entirely, whether this was called from a page's initial render or from a
 * Server Action a polling client component invoked.
 *
 * Redirecting straight to /login would loop: middleware sees NextAuth's
 * cookie is still (nominally) valid and bounces a logged-in user away from
 * /login back to "/", which immediately 401s again. /session-expired is
 * outside that logic — middleware lets a "logged in" user reach it — and
 * its own button actually calls signOut() (only allowed from a Server
 * Action/Route Handler, not from here mid-render) before sending them to a
 * real login page.
 *
 * Passed as a plain relative path, NOT manually BASE_PATH-prefixed — unlike
 * middleware.ts's NextResponse.redirect() (which needs manual prefixing,
 * confirmed by extensive live testing), this next/navigation redirect() is
 * the App-Router Server Component/Action variant, which DOES auto-prepend
 * Next's basePath for a path starting with "/" on its own. Manually
 * prefixing here as well (an earlier version of this code did) doubles it
 * up into "/admin/admin/session-expired" — caught live while testing this
 * exact fix, by simulating an expired token (rotating ADMIN_API_SECRET on
 * the bot-api side without logging out web-admin's session) and observing
 * the actual redirect Location header.
 */
async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await auth();
  if (!session?.apiToken) {
    redirect("/session-expired");
  }

  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${session.apiToken}`);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(`${BOT_API_URL}${path}`, { ...init, headers, cache: "no-store" });
  if (res.status === 401) {
    redirect("/session-expired");
  }
  if (!res.ok) {
    const body: ErrorBody | null = await res.json().catch(() => null);
    throw new AdminApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.message ?? "Request failed", body?.error?.fields);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => adminFetch<T>(path);
const post = <T>(path: string, body?: unknown) =>
  adminFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
const put = <T>(path: string, body: unknown) => adminFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T>(path: string) => adminFetch<T>(path, { method: "DELETE" });

// --- DTOs (mirroring modules/admin/service.ts + moderation/service.ts's return shapes) ---

export type Gender = "male" | "female" | "other";
export type UserStatus = "active" | "banned" | "deleted";
export type ModerationStatus = "pending" | "approved" | "rejected";
export type ReportReason = "harassment" | "unwanted_content" | "suspected_minor" | "spam" | "other";
export type ReportSeverity = "normal" | "high";
export type ReportStatus = "pending" | "reviewed" | "actioned";
export type ReportResolutionAction = "no_action" | "warn" | "temporary_ban" | "permanent_ban";
export type BanType = "temporary" | "permanent";
export type BanAppealStatus = "pending" | "upheld" | "reversed";
export type BroadcastStatus = "pending" | "sending" | "completed";

export interface ReportDto {
  id: string;
  reporterId: string | null;
  reportedUserId: string;
  sessionId: string | null;
  reason: ReportReason;
  severity: ReportSeverity;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByAdminId: string | null;
  resolutionAction: ReportResolutionAction | null;
}

export interface ReportQueueEntryDto {
  report: ReportDto;
  reportedUserHistory: { pastReportCount: number; pastBanCount: number };
}

export interface BanAppealDto {
  id: string;
  banRecordId: string;
  userId: string;
  message: string;
  status: BanAppealStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByAdminId: string | null;
}

export interface PendingPhotoDto {
  userId: string;
  photoUrl: string;
  photoSubmittedAt: string | null;
}

export interface UserSearchResultDto {
  id: string;
  status: UserStatus;
  gender: Gender | null;
  createdAt: string;
  hasPhoto: boolean;
}

export interface ProfileDto {
  id: string;
  userId: string;
  displayBio: string | null;
  interests: string[];
  photoUrl: string | null;
  photoModerationStatus: ModerationStatus;
  photoSubmittedAt: string | null;
}

export interface BanRecordDto {
  id: string;
  userId: string;
  reason: string;
  type: BanType;
  expiresAt: string | null;
  issuedByAdminId: string;
  issuedByAdmin: { username: string };
  createdAt: string;
}

export interface UserDetailDto {
  user: {
    id: string;
    status: UserStatus;
    gender: Gender | null;
    birthDate: string | null;
    ageAttestedAt: string | null;
    createdAt: string;
    // EPIC 8 (US-8.4)
    lastActiveAt: string | null;
    notificationsOptedOut: boolean;
    lastNudgeSentAt: string | null;
  };
  profile: ProfileDto | null;
  matchCount: number;
  reportsFiledCount: number;
  reportsReceived: ReportDto[];
  banRecords: BanRecordDto[];
  banAppeals: BanAppealDto[];
}

export interface BannedPatternDto {
  id: string;
  pattern: string;
  severity: ReportSeverity;
  createdAt: string;
}

export interface DailyTrendEntryDto {
  date: string;
  dau: number;
  newSignups: number;
  matchesCreated: number;
  // EPIC 8 (US-8.3) — new trend series backed by the Event table.
  chatsEnded: number;
  reportsSubmitted: number;
}

export interface DashboardMetricsDto {
  today: {
    dau: number;
    newSignups: number;
    matchesCreated: number;
    chatsEnded: number;
    reportsSubmitted: number;
    activeSessions: number;
    pendingReports: number;
    pendingPhotos: number;
  };
  trend: DailyTrendEntryDto[];
}

export interface BroadcastDto {
  id: string;
  message: string;
  createdByAdminId: string;
  status: BroadcastStatus;
  totalTargeted: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  completedAt: string | null;
}

export const adminApi = {
  reports: {
    list: () => get<ReportQueueEntryDto[]>("/api/v1/admin/reports"),
    resolve: (id: string, action: ReportResolutionAction, banReason?: string) =>
      post<ReportDto>(`/api/v1/admin/reports/${id}/resolve`, { action, banReason }),
  },
  banAppeals: {
    list: () => get<BanAppealDto[]>("/api/v1/admin/ban-appeals"),
    resolve: (id: string, outcome: "upheld" | "reversed") =>
      post<BanAppealDto>(`/api/v1/admin/ban-appeals/${id}/resolve`, { outcome }),
  },
  photos: {
    list: () => get<PendingPhotoDto[]>("/api/v1/admin/photos"),
    approve: (userId: string) => post<ProfileDto>(`/api/v1/admin/photos/${userId}/approve`),
    reject: (userId: string) => post<ProfileDto>(`/api/v1/admin/photos/${userId}/reject`),
  },
  users: {
    search: (q: string) => get<UserSearchResultDto[]>(`/api/v1/admin/users?q=${encodeURIComponent(q)}`),
    detail: (id: string) => get<UserDetailDto>(`/api/v1/admin/users/${id}`),
    ban: (id: string, input: { type: BanType; reason: string; expiresInDays?: number }) =>
      post<BanRecordDto>(`/api/v1/admin/users/${id}/ban`, input),
    reverseBan: (id: string) => post<{ id: string; status: UserStatus }>(`/api/v1/admin/users/${id}/reverse-ban`),
    remove: (id: string) => del<{ deleted: true }>(`/api/v1/admin/users/${id}`),
  },
  patterns: {
    list: () => get<BannedPatternDto[]>("/api/v1/admin/patterns"),
    create: (input: { pattern: string; severity: ReportSeverity }) =>
      post<BannedPatternDto>("/api/v1/admin/patterns", input),
    update: (id: string, input: { pattern?: string; severity?: ReportSeverity }) =>
      put<BannedPatternDto>(`/api/v1/admin/patterns/${id}`, input),
    remove: (id: string) => del<{ deleted: true }>(`/api/v1/admin/patterns/${id}`),
  },
  dashboard: {
    metrics: () => get<DashboardMetricsDto>("/api/v1/admin/dashboard"),
  },
  broadcast: {
    audience: () => get<{ count: number }>("/api/v1/admin/broadcast/audience"),
    list: () => get<BroadcastDto[]>("/api/v1/admin/broadcast"),
    get: (id: string) => get<BroadcastDto>(`/api/v1/admin/broadcast/${id}`),
    send: (message: string) => post<BroadcastDto>("/api/v1/admin/broadcast", { message }),
  },
};
