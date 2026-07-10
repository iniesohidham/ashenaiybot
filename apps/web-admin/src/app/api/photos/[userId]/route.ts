import { auth } from "@/auth";
import { BOT_API_URL } from "@/lib/bot-api-url";

/**
 * US-7.3's photo grid needs an actual `<img src>` the browser can load, but
 * bot-api's admin photo-image route needs a Bearer token a plain `<img>`
 * can't attach — same problem apps/web-miniapp's authed-media.tsx solved
 * with a blob-URL fetch, solved here instead with a same-origin proxy: the
 * browser already carries this app's own NextAuth session cookie, so this
 * route handler can read it via auth() and attach the Bearer token
 * server-side before forwarding to bot-api.
 */
export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  const session = await auth();
  if (!session?.apiToken) {
    return new Response(null, { status: 401 });
  }

  const { userId } = await context.params;
  const upstream = await fetch(`${BOT_API_URL}/api/v1/admin/photos/${userId}/image`, {
    headers: { authorization: `Bearer ${session.apiToken}` },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}
