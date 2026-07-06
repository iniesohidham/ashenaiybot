import { z } from "zod";
import { parseEnv } from "@ashena/shared";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "Telegram bot token is required"),
  DATABASE_URL: z.string().url("Database URL must be a valid connection string"),
  REDIS_URL: z.string().url("Redis URL must be a valid connection string"),
  MINIAPP_PUBLIC_URL: z.string().url("Mini App public URL must be a valid URL"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(envSchema, source);
}
