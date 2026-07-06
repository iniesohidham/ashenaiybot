export type DependencyStatus = "ok" | "error";

export interface HealthCheckDeps {
  pingDb: () => Promise<void>;
  pingRedis: () => Promise<void>;
}

export interface HealthCheckResult {
  status: "ok" | "error";
  db: DependencyStatus;
  redis: DependencyStatus;
  details?: Record<string, string>;
}

/**
 * Pure, dependency-injected health check so it's unit-testable without a
 * real Postgres/Redis connection (see US-0.6).
 */
export async function checkHealth(deps: HealthCheckDeps): Promise<HealthCheckResult> {
  const details: Record<string, string> = {};
  let db: DependencyStatus = "ok";
  let redis: DependencyStatus = "ok";

  try {
    await deps.pingDb();
  } catch (err) {
    db = "error";
    details.db = err instanceof Error ? err.message : "unknown error";
  }

  try {
    await deps.pingRedis();
  } catch (err) {
    redis = "error";
    details.redis = err instanceof Error ? err.message : "unknown error";
  }

  const status: "ok" | "error" = db === "ok" && redis === "ok" ? "ok" : "error";
  return status === "ok" ? { status, db, redis } : { status, db, redis, details };
}
