/**
 * bot-api's own base URL, reached server-side only (never from the
 * browser) — see .env.example's note on BOT_API_URL's dual use. Single
 * source of truth so auth.ts / lib/admin-api.ts / the photo proxy route
 * can't drift on the same fallback.
 */
export const BOT_API_URL = process.env.BOT_API_URL ?? "http://localhost:3000";
