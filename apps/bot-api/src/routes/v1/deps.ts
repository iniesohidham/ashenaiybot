import type { Redis } from "ioredis";
import type { Api } from "grammy";

/** Shared across every EPIC 6 route module — server.ts constructs both once and threads them through registerV1Routes. */
export interface RouteDeps {
  redis: Redis;
  api: Api;
}
