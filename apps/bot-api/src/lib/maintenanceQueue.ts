// EPIC 4/5 (worker.ts) — the maintenance queue's name, pulled into its own
// module (mirrors lib/broadcastQueue.ts's own constant) so other modules
// that only need to *read* this queue (EPIC 8's metrics.ts, polling job
// counts for the BullMQ queue-depth gauge) can open a lightweight BullMQ
// Queue client against it without importing worker.ts itself — worker.ts's
// module body runs a `main()` call as a side effect, so importing it from
// anywhere but its own entrypoint would start a second worker process.
export const MAINTENANCE_QUEUE_NAME = "ashena-maintenance";
