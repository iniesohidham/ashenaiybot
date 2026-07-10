import type { FastifyInstance } from "fastify";
import { adminLoginSchema } from "@ashena/shared";
import { checkAndConsumeLoginRateLimit, verifyAdminCredentials } from "../../../modules/admin/service.js";
import { signAdminToken } from "../../../lib/adminToken.js";
import { sendApiError, zodErrorToFields } from "../../../lib/apiError.js";
import type { RouteDeps } from "../deps.js";
import type { Env } from "../../../env.js";

/**
 * US-7.1 — the only /api/v1/admin/* route with no adminAuth preHandler
 * (nothing to bear a token yet). web-admin's NextAuth Credentials provider
 * calls this directly (server-side) from its authorize() callback; on
 * success it gets back a token it then carries in its own session and
 * re-presents as a Bearer token to every other admin route.
 */
export function registerAdminAuthRoutes(app: FastifyInstance, env: Pick<Env, "ADMIN_API_SECRET">, deps: Pick<RouteDeps, "redis">): void {
  const { redis } = deps;

  app.post("/api/v1/admin/auth/login", async (request, reply) => {
    const parsed = adminLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "VALIDATION_ERROR", "Invalid login input.", zodErrorToFields(parsed.error));
    }
    const { username, password } = parsed.data;

    const withinLimit = await checkAndConsumeLoginRateLimit(redis, username, request.ip);
    if (!withinLimit) {
      return sendApiError(reply, 429, "RATE_LIMITED", "Too many failed login attempts. Try again later.");
    }

    const identity = await verifyAdminCredentials(username, password);
    if (!identity) {
      return sendApiError(reply, 401, "INVALID_CREDENTIALS", "Invalid username or password.");
    }

    const token = await signAdminToken(identity, env.ADMIN_API_SECRET);
    return { id: identity.id, username: identity.username, role: identity.role, token };
  });
}
