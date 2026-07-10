import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { BASE_PATH } from "@/lib/base-path";

const ADMIN_ONLY_PATHS = ["/patterns", "/broadcast"];

/**
 * US-7.1's "role is embedded in the session and enforced on every
 * protected route" AC, UI half — the authoritative half is bot-api's own
 * adminAuth preHandler (plugins/adminAuth.ts), which every actual data
 * mutation goes through regardless of what this middleware does. This is
 * just so a moderator never even sees an admin-only screen render before
 * their action gets rejected server-side.
 */
export default auth((req) => {
  // req.nextUrl.pathname includes the `/admin` basePath prefix, but
  // req.nextUrl.basePath itself is empty here (observed live — an
  // auth()-wrapped NextRequest doesn't populate it the way a plain
  // NextRequest does) — stripping the known BASE_PATH constant directly
  // sidesteps relying on that property at all, for both reading the
  // current path and constructing redirect targets.
  const relativePath = req.nextUrl.pathname.startsWith(BASE_PATH)
    ? req.nextUrl.pathname.slice(BASE_PATH.length) || "/"
    : req.nextUrl.pathname;
  const isLoggedIn = Boolean(req.auth);
  const isLoginPage = relativePath === "/login";

  function redirectTo(path: string): NextResponse {
    const url = req.nextUrl.clone();
    url.pathname = `${BASE_PATH}${path}`;
    return NextResponse.redirect(url);
  }

  if (!isLoggedIn && !isLoginPage) return redirectTo("/login");
  if (isLoggedIn && isLoginPage) return redirectTo("/");
  if (isLoggedIn && req.auth?.user?.role !== "admin" && ADMIN_ONLY_PATHS.some((p) => relativePath.startsWith(p))) {
    return redirectTo("/forbidden");
  }
  return NextResponse.next();
});

export const config = {
  // Next.js prepends basePath to these patterns internally, so the
  // catch-all alone becomes "/admin/(...)" — requiring a "/" right after
  // "/admin", which the bare dashboard root (exactly "/admin", no trailing
  // segment) doesn't have. The explicit "/" entry (becomes exactly "/admin")
  // covers that one case the catch-all structurally can't.
  matcher: ["/", "/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
