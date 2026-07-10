/**
 * Next's basePath (see next.config.ts) auto-prefixes Link/useRouter/redirect,
 * but NOT a raw string handed to a plain `<img src>` — this is the single
 * source of truth for that prefix so the two can't drift.
 */
export const BASE_PATH = "/admin";
