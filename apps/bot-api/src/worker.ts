import { Redis } from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { Api } from "grammy";
import { prisma } from "@ashena/db";
import { BROADCAST_SEND_INTERVAL_MS } from "@ashena/shared";
import { loadEnv } from "./env.js";
import { cleanupIdleSessions } from "./modules/chat/service.js";
import { revertExpiredBans } from "./modules/moderation/service.js";
import { findUserById } from "./modules/users/service.js";
import { sweepInactiveUsers } from "./modules/notifications/inactivityNudge.js";
import {
  findBroadcastById,
  incrementBroadcastCounters,
  markBroadcastCompleted,
  markBroadcastSending,
} from "./modules/admin/service.js";
import { BROADCAST_QUEUE_NAME, SEND_BROADCAST_JOB, type SendBroadcastJobData } from "./lib/broadcastQueue.js";
import { MAINTENANCE_QUEUE_NAME } from "./lib/maintenanceQueue.js";
import { CHAT_ENDED_NEXT_PROMPT, IDLE_TIMEOUT_MESSAGE, INACTIVITY_NUDGE_MESSAGE } from "./bot/copy.js";
import { chatEndedKeyboard, chatToolbarRemove } from "./bot/keyboards.js";
import { sendWithRetry } from "./bot/notifications.js";
import { createLogger } from "./lib/logger.js";

/**
 * EPIC 4/5 BullMQ jobs (US-4.7 idle session cleanup, US-5.4's auto-expiry
 * AC) — this is the first real worker logic; EPIC 0 only proved
 * Postgres/Redis connectivity. Uses a standalone grammY `Api` client (no
 * polling) for outbound notifications — the bot-api process (bot.ts) already
 * owns polling via `bot.start()`; the worker must never also call that.
 */

const logger = createLogger("worker");

const IDLE_CLEANUP_JOB = "idle-session-cleanup";
const BAN_EXPIRY_JOB = "ban-expiry-sweep";
const INACTIVITY_NUDGE_JOB = "inactivity-nudge-sweep";
const IDLE_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const BAN_EXPIRY_INTERVAL_MS = 5 * 60 * 1000;
// US-8.4 — once a day is plenty for a "haven't seen you in a while" nudge;
// the per-user "at most one per period" guard (lastNudgeSentAt, see
// modules/notifications/inactivityNudge.ts) is what actually enforces the
// AC, this interval just bounds how often the job even looks.
const INACTIVITY_NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const queue = new Queue(MAINTENANCE_QUEUE_NAME, { connection: bullConnection });
  // Idempotent: BullMQ dedupes repeatable jobs by name+repeat options+jobId,
  // so re-running this on every worker start/restart doesn't pile up
  // duplicate schedules.
  await queue.add(IDLE_CLEANUP_JOB, {}, { repeat: { every: IDLE_CLEANUP_INTERVAL_MS }, jobId: IDLE_CLEANUP_JOB });
  await queue.add(BAN_EXPIRY_JOB, {}, { repeat: { every: BAN_EXPIRY_INTERVAL_MS }, jobId: BAN_EXPIRY_JOB });
  await queue.add(
    INACTIVITY_NUDGE_JOB,
    {},
    { repeat: { every: INACTIVITY_NUDGE_INTERVAL_MS }, jobId: INACTIVITY_NUDGE_JOB },
  );

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
      logger.info({ event: "idle_session_cleanup", endedCount: ended.length }, "idle session cleanup completed");
    }
  }

  async function runBanExpirySweep(): Promise<void> {
    const reverted = await revertExpiredBans();
    if (reverted.length > 0) {
      logger.info({ event: "ban_expiry_sweep", reactivatedCount: reverted.length }, "ban expiry sweep completed");
    }
  }

  async function runInactivityNudgeSweep(): Promise<void> {
    const nudged = await sweepInactiveUsers(env.INACTIVITY_NUDGE_DAYS, async (userId, chatId) => {
      await sendWithRetry(() => api.sendMessage(chatId, INACTIVITY_NUDGE_MESSAGE), `inactivity nudge to ${userId}`);
    });
    if (nudged > 0) {
      logger.info({ event: "inactivity_nudge_sweep", nudgedCount: nudged }, "inactivity nudge sweep completed");
    }
  }

  /** Same log-and-give-up-after-3-attempts shape as sendWithRetry above, but returns success/failure so the caller can count it exactly once — a plain sendWithRetry swallows the final outcome, which US-7.7's delivery-count AC needs. Takes `userId` (internal id) purely for the failure log — never `chatId` (raw Telegram id), same PII rule sendWithRetry follows. */
  async function sendBroadcastMessage(chatId: string, text: string, userId: string): Promise<boolean> {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await api.sendMessage(chatId, text);
        return true;
      } catch (err) {
        if (attempt === attempts) {
          logger.error({ event: "broadcast_send_failed", userId, err }, "broadcast send failed after retries");
          return false;
        }
        await delay(300 * attempt);
      }
    }
    return false;
  }

  /**
   * EPIC 7 (US-7.7) — sends a queued broadcast to every currently-active
   * user, spaced by BROADCAST_SEND_INTERVAL_MS (not sent all at once, per
   * the AC) and updating the durable Broadcast row's counters as it goes so
   * web-admin can poll live progress. The target list is fetched fresh here
   * (not carried in the job payload) so a user who's banned/deleted between
   * enqueue and send doesn't get a message.
   *
   * Known limitation (accepted, not fixed here — flagged by an adversarial
   * review): there's no per-recipient delivery record, only aggregate
   * counters. If the worker process dies mid-send and BullMQ's stalled-job
   * recovery redelivers the job, this re-sends to users who already got the
   * message on the prior attempt (no cursor/checkpoint). The guard below
   * only closes the *more likely* failure mode — a job redelivered after it
   * already reached "completed" (e.g. a lock-renewal hiccup right at the
   * end) — which would otherwise resend the entire broadcast from scratch.
   * Full per-recipient idempotency would need a new join table tracking
   * delivery per (broadcast, user); not worth the scope for how rare a
   * mid-send crash is and how low-severity a duplicate announcement is.
   */
  async function runSendBroadcast(broadcastId: string): Promise<void> {
    const broadcast = await findBroadcastById(broadcastId);
    if (!broadcast) {
      logger.error({ event: "broadcast_job_unknown", broadcastId }, "send-broadcast job for unknown broadcast");
      return;
    }
    if (broadcast.status === "completed") {
      logger.warn(
        { event: "broadcast_job_already_completed", broadcastId },
        "send-broadcast job for already-completed broadcast, skipping",
      );
      return;
    }
    await markBroadcastSending(broadcastId);

    const activeUsers = await prisma.user.findMany({
      where: { status: "active" },
      select: { id: true, telegramId: true },
    });
    for (const { id: userId, telegramId } of activeUsers) {
      const delivered = await sendBroadcastMessage(telegramId.toString(), broadcast.message, userId);
      await incrementBroadcastCounters(broadcastId, delivered ? "success" : "failure");
      await delay(BROADCAST_SEND_INTERVAL_MS);
    }

    await markBroadcastCompleted(broadcastId);
    logger.info(
      { event: "broadcast_completed", broadcastId, targetCount: activeUsers.length },
      "broadcast completed",
    );
  }

  const worker = new Worker(
    MAINTENANCE_QUEUE_NAME,
    async (job: Job) => {
      if (job.name === IDLE_CLEANUP_JOB) {
        await runIdleSessionCleanup();
      } else if (job.name === BAN_EXPIRY_JOB) {
        await runBanExpirySweep();
      } else if (job.name === INACTIVITY_NUDGE_JOB) {
        await runInactivityNudgeSweep();
      }
    },
    { connection: bullConnection },
  );

  const broadcastWorker = new Worker<SendBroadcastJobData>(
    BROADCAST_QUEUE_NAME,
    async (job) => {
      if (job.name === SEND_BROADCAST_JOB) {
        await runSendBroadcast(job.data.broadcastId);
      }
    },
    { connection: bullConnection },
  );

  worker.on("failed", (job, err) => {
    logger.error({ event: "maintenance_job_failed", jobName: job?.name ?? "unknown", err }, "maintenance job failed");
  });
  broadcastWorker.on("failed", (job, err) => {
    logger.error({ event: "broadcast_job_failed", jobName: job?.name ?? "unknown", err }, "broadcast job failed");
  });

  logger.info(
    {
      event: "worker_ready",
      idleCleanupIntervalMin: IDLE_CLEANUP_INTERVAL_MS / 60_000,
      banExpiryIntervalMin: BAN_EXPIRY_INTERVAL_MS / 60_000,
      inactivityNudgeIntervalMin: INACTIVITY_NUDGE_INTERVAL_MS / 60_000,
    },
    "connected to redis and postgres; maintenance and send-broadcast workers ready",
  );

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await broadcastWorker.close();
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
  logger.error({ event: "worker_startup_failed", err }, "worker failed to start");
  process.exit(1);
});
