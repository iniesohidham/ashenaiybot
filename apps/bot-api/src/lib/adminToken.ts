import { jwtVerify, SignJWT } from "jose";
import { ADMIN_SESSION_MAX_AGE_SECONDS } from "@ashena/shared";
import type { AdminIdentity } from "../modules/admin/service.js";

export class InvalidAdminTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAdminTokenError";
  }
}

/**
 * EPIC 7 (US-7.1) — the token bot-api mints once, at successful login
 * (routes/v1/admin/auth.ts), and web-admin's NextAuth session then simply
 * carries around as an opaque string and re-presents as a Bearer token on
 * every subsequent /api/v1/admin/* call. Signed with ADMIN_API_SECRET
 * (shared only between this app and web-admin, distinct from
 * NEXTAUTH_SECRET) — this app verifies its own signature directly rather
 * than trusting or reimplementing NextAuth's own session-cookie encryption,
 * so admin-role enforcement here doesn't depend on a second app's internals.
 */
export async function signAdminToken(identity: AdminIdentity, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ username: identity.username, role: identity.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.id)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(key);
}

export async function verifyAdminToken(token: string, secret: string): Promise<AdminIdentity> {
  const key = new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.sub !== "string" || typeof payload.username !== "string" || typeof payload.role !== "string") {
      throw new InvalidAdminTokenError("Admin token payload is malformed");
    }
    if (payload.role !== "admin" && payload.role !== "moderator") {
      throw new InvalidAdminTokenError("Admin token has an unrecognized role");
    }
    return { id: payload.sub, username: payload.username, role: payload.role };
  } catch (err) {
    if (err instanceof InvalidAdminTokenError) throw err;
    throw new InvalidAdminTokenError("Admin token is invalid or expired");
  }
}
