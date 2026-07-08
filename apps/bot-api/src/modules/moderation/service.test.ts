import { describe, expect, it } from "vitest";
import { matchTextAgainstPatterns } from "./service.js";

describe("matchTextAgainstPatterns", () => {
  it("does not block text with no matching pattern", () => {
    expect(matchTextAgainstPatterns("hello there", [{ pattern: "badword", severity: "normal" }])).toEqual({
      blocked: false,
    });
  });

  it("blocks on a normal-severity match", () => {
    expect(matchTextAgainstPatterns("this has a badword in it", [{ pattern: "badword", severity: "normal" }])).toEqual(
      { blocked: true, severity: "normal" },
    );
  });

  it("matches case-insensitively", () => {
    expect(matchTextAgainstPatterns("this has a BadWord in it", [{ pattern: "badword", severity: "normal" }])).toEqual(
      { blocked: true, severity: "normal" },
    );
  });

  it("escalates to high severity when a high-severity pattern also matches", () => {
    const patterns = [
      { pattern: "badword", severity: "normal" as const },
      { pattern: "minorindicator", severity: "high" as const },
    ];
    expect(matchTextAgainstPatterns("badword and minorindicator both here", patterns)).toEqual({
      blocked: true,
      severity: "high",
    });
  });

  it("high severity wins even if it's checked before a normal match", () => {
    const patterns = [
      { pattern: "minorindicator", severity: "high" as const },
      { pattern: "badword", severity: "normal" as const },
    ];
    expect(matchTextAgainstPatterns("minorindicator", patterns)).toEqual({ blocked: true, severity: "high" });
  });

  it("returns not blocked for an empty pattern list", () => {
    expect(matchTextAgainstPatterns("anything at all", [])).toEqual({ blocked: false });
  });

  it("ignores empty-string patterns rather than matching everything", () => {
    expect(matchTextAgainstPatterns("anything at all", [{ pattern: "", severity: "high" }])).toEqual({
      blocked: false,
    });
  });
});
