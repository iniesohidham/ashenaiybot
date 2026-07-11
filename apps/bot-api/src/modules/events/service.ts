import { prisma, type EventType, type Prisma } from "@ashena/db";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger("bot-api");

/**
 * EPIC 8 (US-8.3) — a queryable log of the fixed set of product events
 * named in the AC (signup completed, match created, chat ended, report
 * submitted), backing the Admin dashboard (see admin/service.ts's
 * getDashboardMetrics()) instead of the ad-hoc per-metric Prisma queries it
 * used before this epic.
 *
 * Deliberately does NOT track one event per message/swipe — DAU stays
 * computed the way it already was (distinct message senders ∪ swipe actors
 * over operational tables, see admin/service.ts's
 * countDistinctActiveUsersForDay), not migrated to a Event-table query.
 * Doing that properly would mean an Event row per chat message (this
 * product's single highest-volume write), a real perf/scope tradeoff the
 * AC's own named event list doesn't ask for — the AC's "at each key point
 * in the matching/chat/moderation services" reads naturally as the four
 * named events, not literally every state change those services make.
 *
 * trackEvent() never throws: a tracking failure must never break the
 * primary action it's attached to (a match/chat-end/report has already
 * committed by the time this is called at every call site below) — same
 * "log and move on" idiom sendWithRetry() already applies to notification
 * delivery elsewhere in this codebase.
 */
export async function trackEvent(
  type: EventType,
  userId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.event.create({
      data: { type, userId, metadata: metadata as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.error({ event: "event_tracking_failed", eventType: type, userId, err }, "failed to record product event");
  }
}

/** Pure day-window count — the Event-table-backed replacement for admin/service.ts's old ad-hoc prisma.user.count/prisma.match.count-per-day queries. */
export function countEventsByDay(type: EventType, start: Date, end: Date): Promise<number> {
  return prisma.event.count({ where: { type, createdAt: { gte: start, lt: end } } });
}
