import { Redis } from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { Api } from "grammy";
import { prisma } from "@ashena/db";
import { loadEnv } from "./env.js";
import { cleanupIdleSessions } from "./modules/chat/service.js";
import { revertExpiredBans } from "./modules/moderation/service.js";
import { findUserById } from "./modules/users/service.js";
import { CHAT_ENDED_NEXT_PROMPT, IDLE_TIMEOUT_MESSAGE } from "./bot/copy.js";
import { chatEndedKeyboard, chatToolbarRemove } from "./bot/keyboards.js";

/**
 * EPIC 4/5 BullMQ jobs (US-4.7 idle session cleanup, US-5.4's auto-expiry
 * AC) — this is the first real worker logic; EPIC 0 only proved
 * Postgres/Redis connectivity. Uses a standalone grammY `Api` client (no
 * polling) for outbound notifications — the bot-api process (bot.ts) already
 * owns polling via `bot.start()`; the worker must never also call that.
 */

const MAINTENANCE_QUEUE = "ashena-maintenance";
const IDLE_CLEANUP_JOB = "idle-session-cleanup";
const BAN_EXPIRY_JOB = "ban-expiry-sweep";
const IDLE_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const BAN_EXPIRY_INTERVAL_MS = 5 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same best-effort-with-retries approach as bot/chat.ts's/bot/matching.ts's sendWithRetry — a notification here is exactly the kind of low-priority, async-delivered message where a transient failure shouldn't just be dropped after one attempt. */
async function sendWithRetry(send: () => Promise<unknown>, label: string): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await send();
      return;
    } catch (err) {
      if (attempt === attempts) {
        console.error(`[worker] failed to deliver ${label} after ${attempts} attempts`, err);
        return;
      }
      await delay(300 * attempt);
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const redis = new Redis(env.REDIS_URL);
  // BullMQ requires its blocking connections to disable ioredis's own retry
  // limit — a separate connection from the one chat/service.ts uses for the
  // active-session pointers.
  const bullConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  await redis.ping();
  await prisma.$queryRaw`SELECT 1`;

  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  const idleThresholdMs = env.IDLE_SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;

  const queue = new Queue(MAINTENANCE_QUEUE, { connection: bullConnection });
  // Idempotent: BullMQ dedupes repeatable jobs by name+repeat options+jobId,
  // so re-running this on every worker start/restart doesn't pile up
  // duplicate schedules.
  await queue.add(IDLE_CLEANUP_JOB, {}, { repeat: { every: IDLE_CLEANUP_INTERVAL_MS }, jobId: IDLE_CLEANUP_JOB });
  await queue.add(BAN_EXPIRY_JOB, {}, { repeat: { every: BAN_EXPIRY_INTERVAL_MS }, jobId: BAN_EXPIRY_JOB });

  async function notifyIdleTimeout(userId: string): Promise<void> {
    const user = await findUserById(userId);
    if (!user) return;
    const chatId = user.telegramId.toString();
    await sendWithRetry(
      () => api.sendMessage(chatId, IDLE_TIMEOUT_MESSAGE, { reply_markup: chatToolbarRemove() }),
      `idle-timeout notification to ${userId}`,
    );
    await sendWithRetry(
      () => api.sendMessage(chatId, CHAT_ENDED_NEXT_PROMPT, { reply_markup: chatEndedKeyboard() }),
      `idle-timeout next-prompt to ${userId}`,
    );
  }

  async function runIdleSessionCleanup(): Promise<void> {
    const ended = await cleanupIdleSessions(redis, idleThresholdMs);
    // Independent per ended session — no ordering dependency between them.
    await Promise.all(
      ended.map(({ match }) => Promise.all([notifyIdleTimeout(match.userAId), notifyIdleTimeout(match.userBId)])),
    );
    if (ended.length > 0) {
      console.log(`[worker] idle session cleanup: ended ${ended.length} session(s)`);
    }
  }

  async function runBanExpirySweep(): Promise<void> {
    const reverted = await revertExpiredBans();
    if (reverted.length > 0) {
      console.log(`[worker] ban expiry sweep: reactivated ${reverted.length} user(s)`);
    }
  }

  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job: Job) => {
      if (job.name === IDLE_CLEANUP_JOB) {
        await runIdleSessionCleanup();
      } else if (job.name === BAN_EXPIRY_JOB) {
        await runBanExpirySweep();
      }
    },
    { connection: bullConnection },
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.name ?? "unknown"} failed`, err);
  });

  console.log(
    "[worker] connected to redis and postgres; idle-session-cleanup " +
      `(every ${IDLE_CLEANUP_INTERVAL_MS / 60_000}min) and ban-expiry-sweep ` +
      `(every ${BAN_EXPIRY_INTERVAL_MS / 60_000}min) jobs scheduled`,
  );

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await queue.close();
    await bullConnection.quit();
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
