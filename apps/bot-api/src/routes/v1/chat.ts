import type { FastifyInstance } from "fastify";
import { InputFile } from "grammy";
import type { ActiveSession } from "../../modules/chat/service.js";
import { fileReportSchema, sendTextMessageSchema } from "@ashena/shared";
import { createMiniAppAuthPreHandler } from "../../plugins/miniAppAuth.js";
import {
  endSession,
  findMessageById,
  getActiveSessionForUser,
  listMessages,
  persistMessage,
  resolveSessionParticipant,
  startOrResumeSession,
} from "../../modules/chat/service.js";
import {
  checkAndConsumeMessageRateLimit,
  checkSpamPattern,
  checkText,
  fileReport,
  hasFiledReportForSession,
  upsertBlock,
} from "../../modules/moderation/service.js";
import { findUserById } from "../../modules/users/service.js";
import { notifyChatStarted, notifyOtherPartySessionEnded, sendWithRetry } from "../../bot/notifications.js";
import { sendTelegramFile } from "../../lib/telegramFile.js";
import { sendApiError, zodErrorToFields } from "../../lib/apiError.js";
import type { RouteDeps } from "./deps.js";
import type { Env } from "../../env.js";

function toPublicMessage(sessionId: string, message: { id: string; type: string; contentRef: string; sentAt: Date; senderUserId: string }, selfUserId: string) {
  const fromSelf = message.senderUserId === selfUserId;
  return {
    id: message.id,
    type: message.type,
    sentAt: message.sentAt,
    fromSelf,
    text: message.type === "text" ? message.contentRef : null,
    mediaUrl: message.type === "text" ? null : `/api/v1/chat/sessions/${sessionId}/messages/${message.id}/media`,
  };
}

/**
 * EPIC 6 (US-6.5) — wraps the exact same session lifecycle + relay
 * mechanism bot/chat.ts uses (modules/chat/service.ts, modules/moderation/
 * service.ts), including the same rate limit / keyword filter / spam
 * detection gates. Every cross-party push (chat-started, session-ended)
 * goes through bot/notifications.ts, the same functions bot/chat.ts itself
 * now calls after EPIC 6's extraction — no separate notification logic.
 */
export function registerChatRoutes(app: FastifyInstance, env: Pick<Env, "TELEGRAM_BOT_TOKEN">, deps: RouteDeps): void {
  const authenticate = createMiniAppAuthPreHandler(env.TELEGRAM_BOT_TOKEN);
  const { redis, api } = deps;

  /**
   * Content-sending routes (text/photo/voice) must resolve the session the
   * SAME way bot/chat.ts's message handlers do — via getActiveSessionForUser,
   * which requires endedAt === null and match.status === "active" — not via
   * the permissive resolveSessionParticipant (modules/chat/service.ts) that
   * report/block/end/read routes use. resolveSessionParticipant deliberately
   * has no active-session filter (report/block must still work on a session
   * that just ended); reusing it here would let a stale sessionId held by a
   * party who was just blocked or who just ended the chat keep relaying
   * content through it. The client-supplied :sessionId is cross-checked
   * against the real active session rather than trusted outright.
   */
  async function resolveActiveOwnedSession(userId: string, sessionId: string): Promise<ActiveSession | null> {
    const active = await getActiveSessionForUser(redis, userId);
    if (!active || active.session.id !== sessionId) return null;
    return active;
  }

  app.get("/api/v1/chat/active", { preHandler: authenticate }, async (request, reply) => {
    const user = request.miniAppUser;
    if (!user) {
      return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
    }
    const active = await getActiveSessionForUser(redis, user.id);
    if (!active) return { session: null };
    return { session: { id: active.session.id, matchId: active.match.id, startedAt: active.session.startedAt } };
  });

  app.post<{ Params: { matchId: string } }>(
    "/api/v1/chat/sessions/:matchId/start",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      const result = await startOrResumeSession(redis, request.params.matchId, user.id);
      if (!result) {
        return sendApiError(reply, 410, "MATCH_UNAVAILABLE", "This match is no longer available.");
      }
      if (result.isNew) {
        await notifyChatStarted(api, result.otherUserId);
      }
      return { session: { id: result.session.id, matchId: result.match.id, startedAt: result.session.startedAt }, isNew: result.isNew };
    },
  );

  app.get<{ Params: { sessionId: string }; Querystring: { afterId?: string } }>(
    "/api/v1/chat/sessions/:sessionId/messages",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      // Read-only — reading a session's own history is safe even once it has
      // ended, so the permissive resolver is fine here (unlike sending).
      const resolved = await resolveSessionParticipant(user.id, request.params.sessionId);
      if (!resolved) {
        return sendApiError(reply, 404, "SESSION_NOT_FOUND", "Chat session not found.");
      }
      const messages = await listMessages(resolved.session.id, { afterId: request.query.afterId });
      return { messages: messages.map((m) => toPublicMessage(resolved.session.id, m, user.id)) };
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/api/v1/chat/sessions/:sessionId/messages",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      const active = await resolveActiveOwnedSession(user.id, request.params.sessionId);
      if (!active) {
        return sendApiError(reply, 404, "SESSION_NOT_FOUND", "Chat session not found or no longer active.");
      }
      const parsed = sendTextMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid message input.", zodErrorToFields(parsed.error));
      }

      const withinLimit = await checkAndConsumeMessageRateLimit(redis, active.session.id, user.id);
      if (!withinLimit) {
        return sendApiError(reply, 429, "RATE_LIMITED", "Too many messages — slow down and try again.");
      }

      const { text } = parsed.data;
      const check = await checkText(text);
      if (check.blocked) {
        await persistMessage(active.session.id, user.id, "text", text, true, check.patternId ?? null);
        if (check.severity === "high") {
          await fileReport(null, user.id, active.session.id, "suspected_minor");
        }
        return sendApiError(reply, 422, "MESSAGE_BLOCKED", "This message was blocked by content filtering.");
      }

      const message = await persistMessage(active.session.id, user.id, "text", text, false);
      if (await checkSpamPattern(user.id, text)) {
        await fileReport(null, user.id, active.session.id, "spam");
      }

      const other = await findUserById(active.otherUserId);
      if (other) {
        await sendWithRetry(
          () => api.sendMessage(other.telegramId.toString(), text),
          `text relay to ${active.otherUserId}`,
        );
      }
      return { message: toPublicMessage(active.session.id, message, user.id) };
    },
  );

  function registerMediaRoute(kind: "photo" | "voice"): void {
    app.post<{ Params: { sessionId: string } }>(
      `/api/v1/chat/sessions/:sessionId/messages/${kind}`,
      { preHandler: authenticate },
      async (request, reply) => {
        const user = request.miniAppUser;
        if (!user) {
          return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
        }
        const active = await resolveActiveOwnedSession(user.id, request.params.sessionId);
        if (!active) {
          return sendApiError(reply, 404, "SESSION_NOT_FOUND", "Chat session not found or no longer active.");
        }
        const upload = await request.file();
        if (!upload) {
          return sendApiError(reply, 400, "VALIDATION_ERROR", "No file uploaded.");
        }

        const withinLimit = await checkAndConsumeMessageRateLimit(redis, active.session.id, user.id);
        if (!withinLimit) {
          return sendApiError(reply, 429, "RATE_LIMITED", "Too many messages — slow down and try again.");
        }

        const buffer = await upload.toBuffer();
        const other = await findUserById(active.otherUserId);
        if (!other) {
          return sendApiError(reply, 404, "PARTNER_UNAVAILABLE", "Your chat partner is no longer available.");
        }

        // Sending straight to the other party's chat both delivers it AND
        // mints the Telegram file_id we persist as contentRef — one
        // round-trip does both, unlike profile photo upload (US-6.3) which
        // has no chat partner to send to and mints via the uploader's own
        // chat instead (see routes/v1/profile.ts).
        const inputFile = new InputFile(buffer, upload.filename);
        const chatId = other.telegramId.toString();
        const fileId =
          kind === "photo"
            ? (await api.sendPhoto(chatId, inputFile)).photo.at(-1)?.file_id
            : (await api.sendVoice(chatId, inputFile)).voice.file_id;
        if (!fileId) {
          return sendApiError(reply, 502, "UPSTREAM_ERROR", "Failed to deliver media.");
        }

        const message = await persistMessage(active.session.id, user.id, kind, fileId, false);
        return { message: toPublicMessage(active.session.id, message, user.id) };
      },
    );
  }
  registerMediaRoute("photo");
  registerMediaRoute("voice");

  app.get<{ Params: { sessionId: string; messageId: string } }>(
    "/api/v1/chat/sessions/:sessionId/messages/:messageId/media",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      const resolved = await resolveSessionParticipant(user.id, request.params.sessionId);
      if (!resolved) {
        return sendApiError(reply, 404, "SESSION_NOT_FOUND", "Chat session not found.");
      }
      const message = await findMessageById(resolved.session.id, request.params.messageId);
      if (!message || message.type === "text") {
        return sendApiError(reply, 404, "MESSAGE_NOT_FOUND", "Media not found.");
      }
      return sendTelegramFile(reply, api, env.TELEGRAM_BOT_TOKEN, message.contentRef);
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/api/v1/chat/sessions/:sessionId/end",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      const resolved = await resolveSessionParticipant(user.id, request.params.sessionId);
      if (!resolved) {
        return sendApiError(reply, 404, "SESSION_NOT_FOUND", "Chat session not found.");
      }
      const ended = await endSession(redis, resolved.session.id, "user_ended", user.id);
      if (ended) {
        await notifyOtherPartySessionEnded(api, ended.match, user.id);
      }
      return { ended: ended !== null };
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/api/v1/chat/sessions/:sessionId/report",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      const resolved = await resolveSessionParticipant(user.id, request.params.sessionId);
      if (!resolved) {
        return sendApiError(reply, 404, "SESSION_NOT_FOUND", "Chat session not found.");
      }
      const parsed = fileReportSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid report input.", zodErrorToFields(parsed.error));
      }

      if (await hasFiledReportForSession(user.id, resolved.session.id)) {
        return { reported: true };
      }

      await fileReport(user.id, resolved.otherUserId, resolved.session.id, parsed.data.reason);
      const ended =
        resolved.session.endedAt === null ? await endSession(redis, resolved.session.id, "reported", user.id) : null;
      if (ended) {
        await notifyOtherPartySessionEnded(api, ended.match, user.id);
      }
      return { reported: true };
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/api/v1/chat/sessions/:sessionId/block",
    { preHandler: authenticate },
    async (request, reply) => {
      const user = request.miniAppUser;
      if (!user) {
        return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing Telegram init data.");
      }
      const resolved = await resolveSessionParticipant(user.id, request.params.sessionId);
      if (!resolved) {
        return sendApiError(reply, 404, "SESSION_NOT_FOUND", "Chat session not found.");
      }
      await upsertBlock(user.id, resolved.otherUserId);
      if (resolved.session.endedAt === null) {
        await endSession(redis, resolved.session.id, "blocked", user.id);
      }
      // US-4.6 parity: no notification to the blocked party, on purpose.
      return { blocked: true };
    },
  );
}
