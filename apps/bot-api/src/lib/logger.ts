import pino, { type Logger } from "pino";

/**
 * EPIC 8 (US-8.1) — one shared structured-JSON logger config used by every
 * process this backend runs as: the combined Fastify+bot process (index.ts,
 * which covers two logical services — REST API and bot — sharing one Node
 * process) and the standalone worker.ts. `service` is the only thing that
 * differs between callers, passed in explicitly rather than inferred.
 *
 * Field shape is the AC's own list (timestamp, level, service, event,
 * userId when relevant) — `timestamp`/`level`/`service` come from this
 * config, `event`/`userId` are per-call fields callers pass in the first
 * (bindings) argument, e.g. `logger.info({ event: "match_created", userId },
 * "...")`. pino's own defaults use `time` (epoch ms) and a numeric `level`;
 * both are overridden below so the AC's literal field names/shapes hold.
 *
 * PII convention (not automatically enforced — same "convention over
 * mechanism" tradeoff toMeResponse() already applies to strip telegramId
 * from API responses): never pass raw Telegram username/phone/numeric id as
 * a log field, only the internal (cuid) `userId`. `redact` below is a
 * backstop for the one concrete field name (`telegramId`) that actually
 * appears on values this codebase logs (e.g. a raw `User`/`ctx.from`
 * object), not a substitute for that discipline.
 */
export function createLogger(service: string): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: ["telegramId", "*.telegramId", "err.telegramId"],
      censor: "[redacted]",
    },
    serializers: { err: pino.stdSerializers.err },
  });
}

export type { Logger };
