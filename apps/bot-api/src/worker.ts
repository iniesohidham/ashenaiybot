import { Redis } from "ioredis";
import { prisma } from "@ashena/db";
import { loadEnv } from "./env.js";

/**
 * EPIC 0 "hello world" only — proves the worker container can reach both
 * Postgres and Redis. Real BullMQ processors (photo moderation, idle-session
 * cleanup, broadcasts) are added starting in EPIC 4/5.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const redis = new Redis(env.REDIS_URL);

  await redis.ping();
  await prisma.$queryRaw`SELECT 1`;
  console.log("[worker] connected to redis and postgres; idle, no jobs registered yet");

  const shutdown = async (): Promise<void> => {
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((err: unknown) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
