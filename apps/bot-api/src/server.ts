import Fastify, { type FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { Api } from "grammy";
import { prisma } from "@ashena/db";
import { checkHealth } from "./health.js";
import { registerV1Routes } from "./routes/v1/index.js";
import type { Env } from "./env.js";

export function buildServer(env: Env): FastifyInstance {
  const app = Fastify({ logger: true });
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  // Standalone client (no polling) so EPIC 6's Mini App routes can push
  // cross-party Telegram notifications via bot/notifications.ts — same
  // pattern worker.ts already uses for its own outbound notifications;
  // bot.ts's Bot instance (with its own, separate Api) owns polling and
  // must stay the only thing calling .start().
  const api = new Api(env.TELEGRAM_BOT_TOKEN);

  registerV1Routes(app, env, { redis, api });

  // Excluded from rate-limiting/auth (added in later epics) so uptime
  // monitoring always gets an answer — see US-0.6.
  app.get("/health", async (_request, reply) => {
    const result = await checkHealth({
      pingDb: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      pingRedis: async () => {
        await redis.ping();
      },
    });
    reply.code(result.status === "ok" ? 200 : 503);
    return result;
  });

  app.addHook("onClose", async () => {
    await redis.quit().catch(() => undefined);
  });

  return app;
}
