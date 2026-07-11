import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { Api } from "grammy";
import { prisma } from "@ashena/db";
import { checkHealth } from "./health.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { createBroadcastQueue } from "./lib/broadcastQueue.js";
import type { Env } from "./env.js";
import type { Logger } from "./lib/logger.js";
import { createMetricsRegistry, registerHttpMetricsHook } from "./lib/metrics.js";

export function buildServer(env: Env, logger: Logger): FastifyInstance {
  // nginx (prod) sets X-Forwarded-For (see nginx/conf.d/default.conf) —
  // without trustProxy, request.ip is always nginx's own address, which
  // silently breaks any IP-keyed logic (the admin login rate limiter added
  // in EPIC 7 is the first thing that actually needs this).
  //
  // EPIC 8 (US-8.1): `loggerInstance` (not `logger`, which Fastify v5 only
  // accepts as an options object, not a pre-built instance) carries our own
  // shared structured-JSON config in, so every request log line has the
  // same {timestamp, level, service, ...} shape the bot/worker processes
  // also use, and all three ship to the same place. The cast below is a
  // types-only mismatch, not a real incompatibility: this repo's pino
  // (^10.3.1, satisfying Fastify's own declared `pino": "^9.14.0 ||
  // ^10.1.0"` dependency range) resolves to a structurally-identical but
  // nominally-distinct `Logger` type from Fastify's own bundled pino
  // dependency in this pnpm tree — a duplicate-package-types issue, not a
  // runtime one (Fastify's own loggerInstance duck-types against pino's
  // actual API).
  const app = Fastify({ loggerInstance: logger as unknown as FastifyBaseLogger, trustProxy: true });
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

  // EPIC 8 (US-8.2) — request latency/error-rate histogram, scraped by
  // Prometheus. Registered before routes run their handlers via Fastify's
  // hook system (see metrics.ts), so it observes every request regardless
  // of which route file handled it, with no per-route instrumentation.
  const metrics = createMetricsRegistry(env.REDIS_URL);
  registerHttpMetricsHook(app, metrics);

  // Not gated behind adminAuth/miniAppAuth — same reasoning as /health
  // below: internal tooling (Prometheus, running inside the same Docker
  // Compose network, see docker-compose.yml) needs to reach this
  // unauthenticated, and nginx never proxies it to the public internet (see
  // nginx/conf.d/default.conf — no /metrics location block exists there).
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", metrics.register.contentType);
    return metrics.register.metrics();
  });

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
    await metrics.close();
  });

  return app;
}
