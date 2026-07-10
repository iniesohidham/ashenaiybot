import type { FastifyInstance } from "fastify";
import { getDashboardMetrics } from "../../../modules/admin/service.js";
import { createAdminAuthPreHandler } from "../../../plugins/adminAuth.js";
import type { Env } from "../../../env.js";

/** US-7.6 — core metrics dashboard, both roles (no role restriction in the AC). */
export function registerAdminDashboardRoutes(app: FastifyInstance, env: Pick<Env, "ADMIN_API_SECRET">): void {
  const authenticate = createAdminAuthPreHandler(env.ADMIN_API_SECRET);

  app.get("/api/v1/admin/dashboard", { preHandler: authenticate }, async () => {
    return getDashboardMetrics();
  });
}
