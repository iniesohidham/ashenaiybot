import client from "prom-client";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { MAINTENANCE_QUEUE_NAME } from "./maintenanceQueue.js";
import { BROADCAST_QUEUE_NAME } from "./broadcastQueue.js";

declare module "fastify" {
  interface FastifyRequest {
    metricsStartNs?: bigint;
  }
}

const JOB_STATES = ["waiting", "active", "delayed", "failed"] as const;

export interface MetricsRegistry {
  register: client.Registry;
  httpRequestDuration: client.Histogram<"method" | "route" | "status_code">;
  close: () => Promise<void>;
}

/**
 * EPIC 8 (US-8.2) — one Registry per buildServer() call (not prom-client's
 * shared global default) so repeated instantiation (e.g. each vitest test
 * building its own app) never throws prom-client's "a metric with this name
 * already exists" on the process-wide default registry.
 *
 * BullMQ queue depth is read via dedicated, connection-only `Queue` clients
 * (never `.add()`/`.process()` from here — worker.ts alone owns producing/
 * consuming both queues) polled on every scrape through prom-client's async
 * `collect()` hook, same "separate connection per concern" convention
 * lib/broadcastQueue.ts's own createBroadcastQueue() already documents.
 */
export function createMetricsRegistry(redisUrl: string): MetricsRegistry {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds, labeled by method/route/status_code",
    labelNames: ["method", "route", "status_code"],
    registers: [register],
  });

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  const queues = [
    new Queue(MAINTENANCE_QUEUE_NAME, { connection }),
    new Queue(BROADCAST_QUEUE_NAME, { connection }),
  ];

  new client.Gauge({
    name: "bullmq_queue_depth",
    help: "BullMQ job counts per queue and state",
    labelNames: ["queue", "state"],
    registers: [register],
    async collect() {
      // The two queues' job counts are independent — fetched in parallel
      // rather than one-at-a-time so a scrape (Prometheus's own poll, or an
      // ad-hoc curl) doesn't pay two sequential Redis round-trips.
      const results = await Promise.all(queues.map((queue) => queue.getJobCounts(...JOB_STATES)));
      queues.forEach((queue, i) => {
        const counts = results[i] ?? {};
        for (const state of JOB_STATES) {
          this.set({ queue: queue.name, state }, counts[state] ?? 0);
        }
      });
    },
  });

  return {
    register,
    httpRequestDuration,
    close: async () => {
      await Promise.all(queues.map((queue) => queue.close()));
      await connection.quit().catch(() => undefined);
    },
  };
}

/**
 * Wall-clock request duration via a hrtime pair on onRequest/onResponse —
 * deliberately not Fastify's own request logger timing, so this stays
 * decoupled from whatever the logger is configured to do. `request.routeOptions.url`
 * (the route *pattern*, e.g. `/api/v1/profile/:userId/photo`) is used as the
 * `route` label rather than `request.url` — the raw URL would create a new
 * label series per distinct id, which both blows up Prometheus's cardinality
 * and defeats the point of grouping latency by endpoint. `routeOptions` is
 * only populated once Fastify's router actually matches a route — a request
 * to a path with no matching route (a typo'd deep link, a scanner probing
 * for endpoints) falls back to a single fixed `"unmatched_route"` label
 * instead of the raw `request.url`, for the same cardinality reason: unlike
 * matched routes (a bounded, known set of patterns), unmatched paths are
 * arbitrary attacker/client-controlled strings with no bound on how many
 * distinct label values they could create.
 */
export function registerHttpMetricsHook(app: FastifyInstance, metrics: MetricsRegistry): void {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    request.metricsStartNs = process.hrtime.bigint();
  });
  app.addHook("onResponse", async (request: FastifyRequest, reply) => {
    const start = request.metricsStartNs;
    const durationSeconds = start ? Number(process.hrtime.bigint() - start) / 1e9 : 0;
    const route = request.routeOptions.url ?? "unmatched_route";
    metrics.httpRequestDuration.observe(
      { method: request.method, route, status_code: String(reply.statusCode) },
      durationSeconds,
    );
  });
}
