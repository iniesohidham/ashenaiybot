import type { FastifyInstance } from "fastify";
import { resolveBanAppealSchema, resolveReportSchema } from "@ashena/shared";
import {
  listPendingBanAppeals,
  listReportQueue,
  resolveBanAppeal,
  resolveReport,
} from "../../../modules/moderation/service.js";
import { createAdminAuthPreHandler } from "../../../plugins/adminAuth.js";
import { sendApiError, zodErrorToFields } from "../../../lib/apiError.js";
import type { RouteDeps } from "../deps.js";
import type { Env } from "../../../env.js";

/**
 * US-7.2 — the report triage queue UI's backing routes, both roles (per the
 * AC: "moderator role can access this screen; both roles can"). Also
 * exposes EPIC 5's ban-appeal queue (US-5.5) as a sibling here rather than
 * its own top-level concern — moderation/service.ts's listPendingBanAppeals/
 * resolveBanAppeal were built "EPIC-7-ready" with no caller yet (see
 * CLAUDE.md), and reviewing a contested ban is close enough in kind to
 * reviewing a report that it doesn't warrant a separate screen.
 */
export function registerAdminReportRoutes(app: FastifyInstance, env: Pick<Env, "ADMIN_API_SECRET">, deps: Pick<RouteDeps, "redis">): void {
  const authenticate = createAdminAuthPreHandler(env.ADMIN_API_SECRET);
  const { redis } = deps;

  app.get("/api/v1/admin/reports", { preHandler: authenticate }, async () => {
    return listReportQueue();
  });

  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/reports/:id/resolve",
    { preHandler: authenticate },
    async (request, reply) => {
      const admin = request.adminUser;
      if (!admin) return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing admin session token.");

      const parsed = resolveReportSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid resolution input.", zodErrorToFields(parsed.error));
      }
      const report = await resolveReport(redis, request.params.id, admin.id, parsed.data.action, parsed.data.banReason);
      if (!report) return sendApiError(reply, 404, "REPORT_NOT_FOUND", "No report with that id.");
      return report;
    },
  );

  app.get("/api/v1/admin/ban-appeals", { preHandler: authenticate }, async () => {
    return listPendingBanAppeals();
  });

  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/ban-appeals/:id/resolve",
    { preHandler: authenticate },
    async (request, reply) => {
      const admin = request.adminUser;
      if (!admin) return sendApiError(reply, 401, "UNAUTHENTICATED", "Missing admin session token.");

      const parsed = resolveBanAppealSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid resolution input.", zodErrorToFields(parsed.error));
      }
      const appeal = await resolveBanAppeal(request.params.id, admin.id, parsed.data.outcome);
      if (!appeal) return sendApiError(reply, 404, "BAN_APPEAL_NOT_FOUND", "No ban appeal with that id.");
      return appeal;
    },
  );
}
