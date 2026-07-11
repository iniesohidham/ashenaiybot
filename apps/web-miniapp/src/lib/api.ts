import type {
  FileReportInput,
  SendTextMessageInput,
  SwipeActionInput,
  UpdateAccountInput,
  UpsertPreferenceInput,
  UpsertProfileInput,
} from "@ashena/shared";
import { getInitDataRaw } from "./telegram";

/**
 * EPIC 6 — typed client for the REST surface routes/v1/*.ts exposes.
 * Attaches initData to every request (US-6.1's AC) and surfaces the
 * backend's one consistent error shape (lib/apiError.ts's ApiErrorBody) as
 * a typed ApiError instead of a bare failed Response.
 */

type Gender = "male" | "female" | "other";
type UserStatus = "active" | "banned" | "deleted";
type ModerationStatus = "pending" | "approved" | "rejected";
type MessageType = "text" | "photo" | "voice" | "sticker";

export interface ProfileDto {
  id: string;
  userId: string;
  displayBio: string | null;
  interests: string[];
  photoUrl: string | null;
  photoModerationStatus: ModerationStatus;
  photoSubmittedAt: string | null;
}

export interface MeDto {
  id: string;
  gender: Gender | null;
  birthDate: string | null;
  status: UserStatus;
  // EPIC 8 (US-8.4) — the inactivity-nudge opt-out toggle.
  notificationsOptedOut: boolean;
  profile: ProfileDto | null;
}

export interface PreferenceDto {
  id: string;
  userId: string;
  interestedInGenders: Gender[];
  minAge: number;
  maxAge: number;
}

export interface PublicCandidateDto {
  id: string;
  gender: Gender | null;
  age: number | null;
  bio: string | null;
  interests: string[];
  hasApprovedPhoto: boolean;
}

export interface ChatSessionDto {
  id: string;
  matchId: string;
  startedAt: string;
}

export interface PublicMessageDto {
  id: string;
  type: MessageType;
  sentAt: string;
  fromSelf: boolean;
  text: string | null;
  mediaUrl: string | null;
}

export interface BlockedUserDto {
  userId: string;
  createdAt: string;
  bio: string | null;
  interests: string[];
}

export class ApiError extends Error {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const rawInitData = getInitDataRaw();
  if (rawInitData) headers.set("x-telegram-init-data", rawInitData);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body: ErrorBody | null = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.message ?? "Request failed", body?.error?.fields);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });
const postForm = <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form });

export const api = {
  getMe: () => get<MeDto>("/api/v1/me"),
  updateAccount: (input: UpdateAccountInput) => put<MeDto>("/api/v1/me", input),
  updateProfile: (input: UpsertProfileInput) => put<ProfileDto>("/api/v1/profile", input),
  uploadProfilePhoto: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return postForm<ProfileDto>("/api/v1/profile/photo", form);
  },
  profilePhotoUrl: (userId: string) => `/api/v1/profile/${userId}/photo`,

  getPreferences: () => get<PreferenceDto>("/api/v1/preferences"),
  updatePreferences: (input: UpsertPreferenceInput) => put<PreferenceDto>("/api/v1/preferences", input),

  getNextCandidate: () => get<{ candidate: PublicCandidateDto | null }>("/api/v1/candidates/next"),
  swipe: (input: SwipeActionInput) =>
    post<{ matched: boolean; matchId: string | null; stale: boolean }>("/api/v1/swipes", input),

  getActiveChat: () => get<{ session: ChatSessionDto | null }>("/api/v1/chat/active"),
  startChat: (matchId: string) =>
    post<{ session: ChatSessionDto; isNew: boolean }>(`/api/v1/chat/sessions/${matchId}/start`),
  getMessages: (sessionId: string, afterId?: string) =>
    get<{ messages: PublicMessageDto[] }>(
      `/api/v1/chat/sessions/${sessionId}/messages${afterId ? `?afterId=${encodeURIComponent(afterId)}` : ""}`,
    ),
  sendTextMessage: (sessionId: string, input: SendTextMessageInput) =>
    post<{ message: PublicMessageDto }>(`/api/v1/chat/sessions/${sessionId}/messages`, input),
  sendMediaMessage: (sessionId: string, kind: "photo" | "voice", file: File | Blob, filename: string) => {
    const form = new FormData();
    form.set("file", file, filename);
    return postForm<{ message: PublicMessageDto }>(`/api/v1/chat/sessions/${sessionId}/messages/${kind}`, form);
  },
  endChat: (sessionId: string) => post<{ ended: boolean }>(`/api/v1/chat/sessions/${sessionId}/end`),
  reportChat: (sessionId: string, input: FileReportInput) =>
    post<{ reported: boolean }>(`/api/v1/chat/sessions/${sessionId}/report`, input),
  blockChat: (sessionId: string) => post<{ blocked: boolean }>(`/api/v1/chat/sessions/${sessionId}/block`),

  getBlockedUsers: () => get<{ blocked: BlockedUserDto[] }>("/api/v1/blocks"),
  unblockUser: (userId: string) => del<{ unblocked: boolean }>(`/api/v1/blocks/${userId}`),

  deleteAccount: () => del<{ deleted: boolean }>("/api/v1/account"),
};
