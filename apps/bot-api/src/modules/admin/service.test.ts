import { describe, expect, it } from "vitest";
import { utcDayBounds } from "./service.js";

describe("utcDayBounds", () => {
  const now = new Date("2026-07-09T15:30:00.000Z");

  it("returns today's UTC calendar-day window at daysAgo=0", () => {
    const { start, end, date } = utcDayBounds(0, now);
    expect(date).toBe("2026-07-09");
    expect(start.toISOString()).toBe("2026-07-09T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });

  it("steps back by whole UTC days", () => {
    const { date } = utcDayBounds(7, now);
    expect(date).toBe("2026-07-02");
  });

  it("crosses a month boundary correctly", () => {
    const { date } = utcDayBounds(1, new Date("2026-08-01T05:00:00.000Z"));
    expect(date).toBe("2026-07-31");
  });
});
