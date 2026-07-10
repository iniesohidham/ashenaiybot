import { Queue } from "bullmq";
import { Redis } from "ioredis";

// EPIC 7 (US-7.7) — shared by server.ts (producer: routes/v1/admin/broadcast.ts
// enqueues) and worker.ts (consumer) so the queue/job names can't drift
// between the two processes, same reason worker.ts's own MAINTENANCE_QUEUE
// job names are constants rather than repeated string literals.
export const BROADCAST_QUEUE_NAME = "ashena-broadcast";
export const SEND_BROADCAST_JOB = "send-broadcast";

export interface SendBroadcastJobData {
  broadcastId: string;
}

/**
 * BullMQ requires its own connection with retries disabled — a separate
 * connection from whatever plain `Redis` client the caller already holds
 * for other purposes (mirrors worker.ts's own bullConnection, which is
 * likewise distinct from its non-BullMQ redis client).
 */
export function createBroadcastQueue(redisUrl: string): Queue<SendBroadcastJobData> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue<SendBroadcastJobData>(BROADCAST_QUEUE_NAME, { connection });
}
