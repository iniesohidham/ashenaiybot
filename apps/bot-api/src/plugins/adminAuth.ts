import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminIdentity } from "../modules/admin/service.js";
import { InvalidAdminTokenError, verifyAdminToken } from "../lib/adminToken.js";
import { sendApiError } from "../lib/apiError.js";

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: AdminIdentity;
  }
}

const AUTH_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";

/**
 * Fastify preHandler protecting every /api/v1/admin/* route except
 * auth/login itself (US-7.1's "Role is embedded in the session and enforced
 * on every protected route" AC) — verifies the Bearer token bot-api itself
 * minted at login (lib/adminToken.ts), independent of whatever web-admin's
 * own NextAuth session does on its side. This is the authoritative check:
 * web-admin's UI-level role gating is only for a good UX (hiding buttons a
 * moderator can't use), not the security boundary.
 */
export function createAdminAuthPreHandler(adminApiSecret: string) {
  return async function adminAuthPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers[AUTH_HEADER];
    const raw = typeof header === "string" ? header : undefined;
    if (!raw?.startsWith(BEARER_PREFIX)) {
      await sendApiError(reply, 401, "UNAUTHENTICATED", "Missing admin session token.");
      return;
    }
    const token = raw.slice(BEARER_PREFIX.length);
    try {
      request.adminUser = await verifyAdminToken(token, adminApiSecret);
    } catch (err) {
      if (err instanceof InvalidAdminTokenError) {
        await sendApiError(reply, 401, "UNAUTHENTICATED", "Admin session token is invalid or expired.");
        return;
      }
      throw err;
    }
  };
}

/** US-7.4/7.5/7.7's admin-only actions (permanent-ban reversal, user deletion, banned-pattern editing, broadcast) — moderator gets 403, not a hidden/disabled button server-side. */
export async function requireAdminRole(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (request.adminUser?.role !== "admin") {
    await sendApiError(reply, 403, "FORBIDDEN", "This action requires the admin role.");
    return false;
  }
  return true;
}
