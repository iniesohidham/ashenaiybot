import type { FastifyInstance } from "fastify";
import { registerAdminAuthRoutes } from "./auth.js";
import { registerAdminReportRoutes } from "./reports.js";
import { registerAdminPhotoRoutes } from "./photos.js";
import { registerAdminUserRoutes } from "./users.js";
import { registerAdminPatternRoutes } from "./patterns.js";
import { registerAdminDashboardRoutes } from "./dashboard.js";
import { registerAdminBroadcastRoutes } from "./broadcast.js";
import type { RouteDeps } from "../deps.js";
import type { Env } from "../../../env.js";

/** EPIC 7 — the Admin Panel's full REST surface, for apps/web-admin. Every route here (except auth/login) requires the Bearer token minted at login (plugins/adminAuth.ts); role-restricted actions call requireAdminRole explicitly. */
export function registerAdminRoutes(app: FastifyInstance, env: Pick<Env, "ADMIN_API_SECRET" | "TELEGRAM_BOT_TOKEN">, deps: RouteDeps): void {
  registerAdminAuthRoutes(app, env, deps);
  registerAdminReportRoutes(app, env, deps);
  registerAdminPhotoRoutes(app, env, deps);
  registerAdminUserRoutes(app, env, deps);
  registerAdminPatternRoutes(app, env);
  registerAdminDashboardRoutes(app, env);
  registerAdminBroadcastRoutes(app, env, deps);
}
