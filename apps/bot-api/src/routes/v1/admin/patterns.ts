import type { FastifyInstance } from "fastify";
import { upsertBannedPatternSchema } from "@ashena/shared";
import {
  createBannedPattern,
  deleteBannedPattern,
  listBannedPatterns,
  updateBannedPattern,
} from "../../../modules/admin/service.js";
import { createAdminAuthPreHandler, requireAdminRole } from "../../../plugins/adminAuth.js";
import { sendApiError, zodErrorToFields } from "../../../lib/apiError.js";
import type { Env } from "../../../env.js";

/** US-7.5 — banned-word/pattern list management, admin role only for every operation (the AC: "not moderator, to limit who can weaken filters" — including read access, so a moderator can't even see the list). */
export function registerAdminPatternRoutes(app: FastifyInstance, env: Pick<Env, "ADMIN_API_SECRET">): void {
  const authenticate = createAdminAuthPreHandler(env.ADMIN_API_SECRET);

  app.get("/api/v1/admin/patterns", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    return listBannedPatterns();
  });

  app.post("/api/v1/admin/patterns", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    const parsed = upsertBannedPatternSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid pattern input.", zodErrorToFields(parsed.error));
    }
    return createBannedPattern(parsed.data.pattern, parsed.data.severity);
  });

  app.put<{ Params: { id: string } }>("/api/v1/admin/patterns/:id", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    const parsed = upsertBannedPatternSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid pattern input.", zodErrorToFields(parsed.error));
    }
    return updateBannedPattern(request.params.id, parsed.data);
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/patterns/:id", { preHandler: authenticate }, async (request, reply) => {
    if (!(await requireAdminRole(request, reply))) return;
    await deleteBannedPattern(request.params.id);
    return { deleted: true };
  });
}
