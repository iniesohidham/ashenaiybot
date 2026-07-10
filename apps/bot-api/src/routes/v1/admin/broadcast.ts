import type { FastifyInstance } from "fastify";
import { broadcastMessageSchema } from "@ashena/shared";
import { countBroadcastAudience, createBroadcast, findBroadcastById, listBroadcasts } from "../../../modules/admin/service.js";
import { SEND_BROADCAST_JOB } from "../../../lib/broadcastQueue.js";
import { createAdminAuthPreHandler, requireAdminRole } from "../../../plugins/adminAuth.js";
import { sendApiError, zodErrorToFields } from "../../../lib/apiError.js";
import type { RouteDeps } from "../deps.js";
import type { Env } from "../../../env.js";

/** US-7.7 — broadcast tool, admin role only per the AC. Queuing is BullMQ-backed (worker.ts's send-broadcast job actually calls sendMessage, rate-limited) — this route only creates the durable Broadcast row and enqueues the job, never sends anything itself. */
export function registerAdminBroadcastRoutes(app: FastifyInstance, env: Pick<Env, "ADMIN_API_SECRET">, deps: Pick<RouteDeps, "broadcastQueue">): void {
  const authenticate = createAdminAuthPreHandler(env.ADMIN_API_SECRET);
  const { broadcastQueue } = deps;

  // US-7.7's "a preview is shown before sending" AC — the audience-size
  // half of that preview (the message text itself is just whatever the
  // admin already typed, no round-trip needed for that part).
  app.get("/api/v1/admin/broadcast/audience", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    return { count: await countBroadcastAudience() };
  });

  app.get("/api/v1/admin/broadcast", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    return listBroadcasts();
  });

  app.get<{ Params: { id: string } }>("/api/v1/admin/broadcast/:id", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    const broadcast = await findBroadcastById(request.params.id);
    if (!broadcast) {
      return sendApiError(reply, 404, "BROADCAST_NOT_FOUND", "No broadcast with that id.");
    }
    return broadcast;
  });

  app.post("/api/v1/admin/broadcast", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    const admin = request.adminUser;
    if (!admin) return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing admin session token.");

    const parsed = broadcastMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid broadcast input.", zodErrorToFields(parsed.error));
    }

    const broadcast = await createBroadcast(admin.id, parsed.data.message);
    await broadcastQueue.add(SEND_BROADCAST_JOB, { broadcastId: broadcast.id }, { jobId: broadcast.id });
    return broadcast;
  });
}
