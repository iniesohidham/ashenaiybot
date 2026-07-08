import { describe, expect, it } from "vitest";
import { computeReportSlaStats, matchTextAgainstPatterns } from "./service.js";

describe("matchTextAgainstPatterns", () => {
  it("does not block text with no matching pattern", () => {
    expect(
      matchTextAgainstPatterns("hello there", [{ id: "p1", pattern: "badword", severity: "normal" }]),
    ).toEqual({ blocked: false });
  });

  it("blocks on a normal-severity match and reports which pattern matched", () => {
    expect(
      matchTextAgainstPatterns("this has a badword in it", [
        { id: "p1", pattern: "badword", severity: "normal" },
      ]),
    ).toEqual({ blocked: true, severity: "normal", patternId: "p1" });
  });

  it("matches case-insensitively", () => {
    expect(
      matchTextAgainstPatterns("this has a BadWord in it", [
        { id: "p1", pattern: "badword", severity: "normal" },
      ]),
    ).toEqual({ blocked: true, severity: "normal", patternId: "p1" });
  });

  it("escalates to high severity when a high-severity pattern also matches, and reports the high-severity pattern's id", () => {
    const patterns = [
      { id: "p1", pattern: "badword", severity: "normal" as const },
      { id: "p2", pattern: "minorindicator", severity: "high" as const },
    ];
    expect(matchTextAgainstPatterns("badword and minorindicator both here", patterns)).toEqual({
      blocked: true,
      severity: "high",
      patternId: "p2",
    });
  });

  it("high severity wins even if it's checked before a normal match", () => {
    const patterns = [
      { id: "p2", pattern: "minorindicator", severity: "high" as const },
      { id: "p1", pattern: "badword", severity: "normal" as const },
    ];
    expect(matchTextAgainstPatterns("minorindicator", patterns)).toEqual({
      blocked: true,
      severity: "high",
      patternId: "p2",
    });
  });

  it("returns not blocked for an empty pattern list", () => {
    expect(matchTextAgainstPatterns("anything at all", [])).toEqual({ blocked: false });
  });

  it("ignores empty-string patterns rather than matching everything", () => {
    expect(
      matchTextAgainstPatterns("anything at all", [{ id: "p1", pattern: "", severity: "high" }]),
    ).toEqual({ blocked: false });
  });

  it("reports the id of the first normal-severity pattern matched when several match", () => {
    const patterns = [
      { id: "p1", pattern: "foo", severity: "normal" as const },
      { id: "p2", pattern: "bar", severity: "normal" as const },
    ];
    expect(matchTextAgainstPatterns("foo bar", patterns)).toEqual({
      blocked: true,
      severity: "normal",
      patternId: "p1",
    });
  });
});

describe("computeReportSlaStats", () => {
  const hours = (n: number): number => n * 60 * 60 * 1000;

  it("returns all-zero stats for no resolved reports", () => {
    expect(computeReportSlaStats([])).toEqual({
      totalResolved: 0,
      resolvedWithin24h: 0,
      highSeverityResolved: 0,
      highSeverityResolvedWithin1h: 0,
    });
  });

  it("counts a normal-severity report resolved within 24h", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const resolvedAt = new Date(createdAt.getTime() + hours(2));
    expect(computeReportSlaStats([{ severity: "normal", createdAt, resolvedAt }])).toEqual({
      totalResolved: 1,
      resolvedWithin24h: 1,
      highSeverityResolved: 0,
      highSeverityResolvedWithin1h: 0,
    });
  });

  it("does not count a report resolved past 24h toward resolvedWithin24h", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const resolvedAt = new Date(createdAt.getTime() + hours(25));
    expect(computeReportSlaStats([{ severity: "normal", createdAt, resolvedAt }])).toEqual({
      totalResolved: 1,
      resolvedWithin24h: 0,
      highSeverityResolved: 0,
      highSeverityResolvedWithin1h: 0,
    });
  });

  it("tracks high-severity reports against the 1h SLA separately from the 24h one", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const resolvedWithinHour = new Date(createdAt.getTime() + hours(0.5));
    const resolvedPastHour = new Date(createdAt.getTime() + hours(2));
    expect(
      computeReportSlaStats([
        { severity: "high", createdAt, resolvedAt: resolvedWithinHour },
        { severity: "high", createdAt, resolvedAt: resolvedPastHour },
      ]),
    ).toEqual({
      totalResolved: 2,
      resolvedWithin24h: 2,
      highSeverityResolved: 2,
      highSeverityResolvedWithin1h: 1,
    });
  });
});
