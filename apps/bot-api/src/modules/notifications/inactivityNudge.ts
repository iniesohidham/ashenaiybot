import { prisma } from "@ashena/db";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger("bot-api");

/**
 * EPIC 8 (US-8.4) — finds users inactive past `days` days (User.lastActiveAt,
 * stamped on every request by modules/users/service.ts's
 * findOrCreateUserByTelegramId — the single choke point both the bot and
 * Mini App already resolve identity through) who haven't opted out
 * (notificationsOptedOut) and haven't already been nudged within the same
 * period (lastNudgeSentAt), sends each one exactly once via the
 * caller-provided `notify`, then stamps lastNudgeSentAt so the next sweep
 * (worker.ts runs this once a day) doesn't re-notify them again until
 * another full period has passed — this is what actually enforces the AC's
 * "at most one nudge per period", not the job's own run interval.
 *
 * `notify` failing for one user must never stop the sweep for the rest
 * (same "independent per recipient" pattern worker.ts's own
 * runIdleSessionCleanup already applies) — enforced with a real try/catch
 * below (not try/finally, which lets a thrown error propagate out of the
 * loop after running the finally block — that would still abort the sweep
 * for every remaining candidate, exactly the failure mode this doc comment
 * says it prevents). A caught failure does NOT stamp lastNudgeSentAt: a
 * user whose notify() genuinely failed should be retried on the next sweep,
 * not silently marked as nudged for the rest of the period.
 *
 * A user with `lastActiveAt: null` (never recorded — true only for accounts
 * created before this column existed, until their next bot/Mini-App
 * interaction) is naturally excluded by the `lt: cutoff` comparison (SQL
 * NULL semantics: `NULL < cutoff` is never true), not specially handled —
 * they become eligible the moment they're active at least once and then go
 * quiet again, which is the correct behavior anyway.
 */
export async function sweepInactiveUsers(
  days: number,
  notify: (userId: string, chatId: string) => Promise<void>,
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const candidates = await prisma.user.findMany({
    where: {
      status: "active",
      notificationsOptedOut: false,
      lastActiveAt: { lt: cutoff },
      OR: [{ lastNudgeSentAt: null }, { lastNudgeSentAt: { lt: cutoff } }],
    },
    select: { id: true, telegramId: true },
  });

  let nudged = 0;
  for (const user of candidates) {
    try {
      await notify(user.id, user.telegramId.toString());
      await prisma.user.update({ where: { id: user.id }, data: { lastNudgeSentAt: new Date() } });
      nudged++;
    } catch (err) {
      logger.error({ event: "inactivity_nudge_failed", userId: user.id, err }, "failed to send inactivity nudge");
    }
  }
  return nudged;
}
