import type { Redis } from "ioredis";
import type { Api } from "grammy";
import type { Queue } from "bullmq";
import type { SendBroadcastJobData } from "../../lib/broadcastQueue.js";

/** Shared across every EPIC 6/7 route module — server.ts constructs these once and threads them through registerV1Routes. */
export interface RouteDeps {
  redis: Redis;
  api: Api;
  broadcastQueue: Queue<SendBroadcastJobData>;
}
