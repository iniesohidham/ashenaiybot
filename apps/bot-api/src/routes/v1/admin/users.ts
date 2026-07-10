import type { FastifyInstance } from "fastify";
import { banUserSchema, DEFAULT_BAN_DURATION_DAYS } from "@ashena/shared";
import { getUserDetail, searchUsersById } from "../../../modules/admin/service.js";
import { banUser, reverseBan } from "../../../modules/moderation/service.js";
import { deleteAccount, findUserById } from "../../../modules/users/service.js";
import { endSession, listActiveSessionsForUser } from "../../../modules/chat/service.js";
import { clearBrowsingState } from "../../../modules/matching/service.js";
import { notifyOtherPartySessionEnded } from "../../../bot/notifications.js";
import { createAdminAuthPreHandler, requireAdminRole } from "../../../plugins/adminAuth.js";
import { sendApiError, zodErrorToFields } from "../../../lib/apiError.js";
import type { RouteDeps } from "../deps.js";
import type { Env } from "../../../env.js";

/** US-7.4 — user search/detail (both roles) and ban issuance (both roles), with permanent-ban reversal and full account deletion gated admin-only per the AC. */
export function registerAdminUserRoutes(app: FastifyInstance, env: Pick<Env, "ADMIN_API_SECRET">, deps: Pick<RouteDeps, "redis" | "api">): void {
  const authenticate = createAdminAuthPreHandler(env.ADMIN_API_SECRET);
  const { redis, api } = deps;

  app.get<{ Querystring: { q?: string } }>("/api/v1/admin/users", { preHandler: authenticate }, async (request, reply) => {
    const q = request.query.q?.trim();
    if (!q) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Query param 'q' (a user id prefix) is required.");
    }
    return searchUsersById(q);
  });

  app.get<{ Params: { id: string } }>("/api/v1/admin/users/:id", { preHandler: authenticate }, async (request, reply) => {
    const detail = await getUserDetail(request.params.id);
    if (!detail) {
      return sendApiError(reply, 404, "USER_NOT_FOUND", "No user with that id.");
    }
    return detail;
  });

  app.post<{ Params: { id: string } }>("/api/v1/admin/users/:id/ban", { preHandler: authenticate }, async (request, reply) => {
    const admin = request.adminUser;
    if (!admin) return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing admin session token.");

    const parsed = banUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid ban input.", zodErrorToFields(parsed.error));
    }

    // A stale/mistyped id would otherwise reach banUser()'s prisma.user.update
    // directly and throw an unhandled Prisma P2025, surfacing as a raw 500
    // instead of a clean 404 — an adversarial review flagged this gap across
    // every mutating route in this file.
    const target = await findUserById(request.params.id);
    if (!target) return sendApiError(reply, 404, "USER_NOT_FOUND", "No user with that id.");

    const { type, reason, expiresInDays } = parsed.data;
    const expiresAt = type === "temporary" ? new Date(Date.now() + (expiresInDays ?? DEFAULT_BAN_DURATION_DAYS) * 24 * 60 * 60 * 1000) : null;

    const result = await banUser(redis, request.params.id, reason, type, expiresAt, admin.id);
    // banUser() itself only ends the session(s) — notifying the chat
    // partner is always the caller's job (same split routes/v1/account.ts's
    // deleteAccount route already follows for the exact same reason: the
    // banned user gets no proactive message at all, reactive-only per
    // CLAUDE.md's documented convention, but their (former) chat partner(s)
    // still deserve the same neutral "left the chat" notice any other
    // end-chat reason produces).
    for (const ended of result.endedSessions) {
      await notifyOtherPartySessionEnded(api, ended.match, request.params.id);
    }
    return result.banRecord;
  });

  app.post<{ Params: { id: string } }>("/api/v1/admin/users/:id/reverse-ban", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    const target = await findUserById(request.params.id);
    if (!target) return sendApiError(reply, 404, "USER_NOT_FOUND", "No user with that id.");

    // reverseBan() only reactivates a user whose status is currently
    // `banned` (see its own doc comment) — null means it wasn't, e.g.
    // already active, or soft-deleted since the ban. Either way that's a
    // real state conflict worth a clear response, not a silent no-op 200.
    const user = await reverseBan(request.params.id);
    if (!user) return sendApiError(reply, 409, "NOT_BANNED", "This user is not currently banned.");

    // Never return the raw Prisma User row — it carries telegramId (a
    // BigInt Fastify's default JSON serializer can't even stringify, on top
    // of it being exactly the identity field that must never reach a
    // client), same rule routes/v1/profile.ts's toMeResponse() documents.
    return { id: user.id, status: user.status };
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/users/:id", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    const userId = request.params.id;
    const target = await findUserById(userId);
    if (!target) return sendApiError(reply, 404, "USER_NOT_FOUND", "No user with that id.");

    // Same orchestration as routes/v1/account.ts's self-service deletion —
    // deleteAccount() itself is a soft delete that doesn't touch active
    // sessions (see modules/users/service.ts's doc comment), so ending them
    // and notifying partners is this route's job, not that function's.
    const activeSessions = await listActiveSessionsForUser(userId);
    for (const session of activeSessions) {
      const ended = await endSession(redis, session.id, "user_ended", userId);
      if (ended) {
        await notifyOtherPartySessionEnded(api, ended.match, userId);
      }
    }
    await clearBrowsingState(redis, userId);
    await deleteAccount(userId);
    return { deleted: true };
  });
}
