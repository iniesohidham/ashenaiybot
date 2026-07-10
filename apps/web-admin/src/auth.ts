import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  ADMIN_SESSION_UPDATE_AGE_SECONDS,
  adminLoginSchema,
  type AdminRoleValue as AdminRole,
} from "@ashena/shared";
import { BOT_API_URL } from "@/lib/bot-api-url";

declare module "next-auth" {
  interface User {
    role?: AdminRole;
    apiToken?: string;
  }
  interface Session {
    user: { id: string; role: AdminRole } & DefaultSession["user"];
    apiToken: string;
  }
}

// next-auth/jwt's JWT interface (from @auth/core/jwt) extends
// Record<string, unknown> — module augmentation on that subpath doesn't
// resolve cleanly under this project's moduleResolution setting, so
// token.role/token.apiToken are read back out with an explicit cast below
// instead (harmless: Record<string, unknown> already accepts writing any
// value into token.role/token.apiToken with no augmentation needed at all).

interface AdminLoginResponse {
  id: string;
  username: string;
  role: AdminRole;
  token: string;
}

/**
 * EPIC 7 (US-7.1) — NextAuth owns the browser-facing session (cookie,
 * inactivity expiry via updateAge, CSRF); the Credentials provider's
 * authorize() is a thin proxy to bot-api's own POST /api/v1/admin/auth/login,
 * which does the actual bcrypt verification + rate limiting and mints the
 * token this app then carries around as session.apiToken — see
 * lib/adminToken.ts on the bot-api side for why the token itself is signed
 * there, not here.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required for any self-hosted (non-Vercel/Cloudflare) deployment — Auth.js
  // otherwise rejects every request with an "UntrustedHost" error, since it
  // has no other signal that the incoming Host header is safe to trust. This
  // app always sits behind nginx (prod) or is hit directly in dev, never
  // through a platform that auto-infers this the way Vercel does.
  trustHost: true,
  // Explicit, not left to default: @auth/core's own bare default is "/auth"
  // (confirmed by reading its bundled source), and nothing here auto-
  // upgrades that to the Next.js "/api/auth" convention on its own — without
  // this, action-parsing regexes against "/auth" a path like
  // "/api/auth/csrf" and throws "Cannot parse action" on every request.
  // NOT `${BASE_PATH}/api/auth` — despite Next's `basePath` prefixing the
  // URL for middleware, Route Handlers (this file's own request context)
  // receive the basePath-ALREADY-STRIPPED path (confirmed live: request.url
  // was "http://host/api/auth/csrf", no "/admin" prefix).
  basePath: "/api/auth",
  session: {
    strategy: "jwt",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    updateAge: ADMIN_SESSION_UPDATE_AGE_SECONDS,
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      authorize: async (credentials) => {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const res = await fetch(`${BOT_API_URL}/api/v1/admin/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) return null;

        const data = (await res.json()) as AdminLoginResponse;
        return { id: data.id, name: data.username, role: data.role, apiToken: data.token };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = user.role;
        token.apiToken = user.apiToken;
      }
      return token;
    },
    session: async ({ session, token }) => {
      const role = token.role as AdminRole | undefined;
      const apiToken = token.apiToken as string | undefined;
      if (token.sub) session.user.id = token.sub;
      if (role) session.user.role = role;
      if (apiToken) session.apiToken = apiToken;
      return session;
    },
  },
});
