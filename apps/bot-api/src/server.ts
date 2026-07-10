import Fastify, { type FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { Api } from "grammy";
import { prisma } from "@ashena/db";
import { checkHealth } from "./health.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { createBroadcastQueue } from "./lib/broadcastQueue.js";
import type { Env } from "./env.js";

export function buildServer(env: Env): FastifyInstance {
  // nginx (prod) sets X-Forwarded-For (see nginx/conf.d/default.conf) —
  // without trustProxy, request.ip is always nginx's own address, which
  // silently breaks any IP-keyed logic (the admin login rate limiter added
  // in EPIC 7 is the first thing that actually needs this).
  const app = Fastify({ logger: true, trustProxy: true });
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  // Standalone client (no polling) so EPIC 6's Mini App routes can push
  // cross-party Telegram notifications via bot/notifications.ts — same
  // pattern worker.ts already uses for its own outbound notifications;
  // bot.ts's Bot instance (with its own, separate Api) owns polling and
  // must stay the only thing calling .start().
  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  // EPIC 7 (US-7.7) — a separate BullMQ-dedicated connection (retries
  // disabled), same reason worker.ts's own bullConnection is distinct from
  // its plain redis client above.
  const broadcastQueue = createBroadcastQueue(env.REDIS_URL);

  registerV1Routes(app, env, { redis, api, broadcastQueue });

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
    await broadcastQueue.close();
  });

  return app;
}
