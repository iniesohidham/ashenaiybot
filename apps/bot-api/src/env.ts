import { z } from "zod";
import { parseEnv } from "@ashena/shared";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "Telegram bot token is required"),
  DATABASE_URL: z.string().url("Database URL must be a valid connection string"),
  REDIS_URL: z.string().url("Redis URL must be a valid connection string"),
  MINIAPP_PUBLIC_URL: z.string().url("Mini App public URL must be a valid URL"),
  // US-4.7: how long a ChatSession can sit with no activity before the
  // worker auto-ends it.
  IDLE_SESSION_TIMEOUT_HOURS: z.coerce.number().positive().default(24),
  // EPIC 7 — shared HS256 secret between this app and apps/web-admin. THIS
  // app mints a short-lived JWT asserting {sub, username, role} once, at
  // login (lib/adminToken.ts, routes/v1/admin/auth.ts) — web-admin never
  // signs its own; it just carries that token around in its own NextAuth
  // session and re-presents it as a Bearer token on every subsequent admin
  // route. This app then verifies that signature itself (plugins/adminAuth.ts)
  // rather than trusting NextAuth's own session cookie format, so admin-role
  // enforcement doesn't depend on reimplementing NextAuth's internal JWE
  // encryption in a second app.
  ADMIN_API_SECRET: z.string().min(32, "Admin API secret must be at least 32 characters"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(envSchema, source);
}
