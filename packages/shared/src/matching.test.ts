import { describe, expect, it } from "vitest";
import { calculateAge } from "./onboarding.js";
import {
  birthDateBoundsForAgeRange,
  defaultAgeRange,
  defaultInterestedInGenders,
  parseAgeRangeInput,
} from "./matching.js";

describe("defaultInterestedInGenders", () => {
  it("defaults to the opposite gender for male", () => {
    expect(defaultInterestedInGenders("male")).toEqual(["female"]);
  });

  it("defaults to the opposite gender for female", () => {
    expect(defaultInterestedInGenders("female")).toEqual(["male"]);
  });

  it("defaults to everyone for other (no opposite)", () => {
    expect(defaultInterestedInGenders("other")).toEqual(["male", "female", "other"]);
  });

  it("defaults to everyone when gender is unset", () => {
    expect(defaultInterestedInGenders(null)).toEqual(["male", "female", "other"]);
  });
});

describe("defaultAgeRange", () => {
  it("spreads ±5 years around the given age", () => {
    expect(defaultAgeRange(25)).toEqual({ minAge: 20, maxAge: 30 });
  });

  it("clamps the lower bound at 18", () => {
    expect(defaultAgeRange(20)).toEqual({ minAge: 18, maxAge: 25 });
  });

  it("clamps the upper bound at 99", () => {
    expect(defaultAgeRange(97)).toEqual({ minAge: 92, maxAge: 99 });
  });
});

describe("parseAgeRangeInput", () => {
  it("parses a simple range", () => {
    expect(parseAgeRangeInput("25-35")).toEqual({ ok: true, minAge: 25, maxAge: 35 });
  });

  it("tolerates surrounding spaces and an en-dash", () => {
    expect(parseAgeRangeInput("25 – 35")).toEqual({ ok: true, minAge: 25, maxAge: 35 });
  });

  it("normalizes Persian digits", () => {
    expect(parseAgeRangeInput("۲۵-۳۵")).toEqual({ ok: true, minAge: 25, maxAge: 35 });
  });

  it("rejects unparseable text", () => {
    expect(parseAgeRangeInput("not a range")).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("rejects a minimum below 18", () => {
    expect(parseAgeRangeInput("17-30")).toEqual({ ok: false, reason: "out_of_bounds" });
  });

  it("rejects a maximum above 99", () => {
    expect(parseAgeRangeInput("30-100")).toEqual({ ok: false, reason: "out_of_bounds" });
  });

  it("rejects a minimum greater than the maximum", () => {
    expect(parseAgeRangeInput("35-25")).toEqual({ ok: false, reason: "min_after_max" });
  });
});

describe("birthDateBoundsForAgeRange", () => {
  const now = new Date("2026-07-06T00:00:00.000Z");

  // Cross-validates against calculateAge() directly instead of hardcoding
  // fragile exact dates — the two must always agree on who's "in range".
  function isWithinBounds(birthDate: Date, minAge: number, maxAge: number): boolean {
    const { minBirthDate, maxBirthDate } = birthDateBoundsForAgeRange(minAge, maxAge, now);
    return birthDate > minBirthDate && birthDate <= maxBirthDate;
  }

  const samples: Date[] = [
    new Date("2000-07-06T00:00:00.000Z"), // turns exactly 26 today
    new Date("2000-07-07T00:00:00.000Z"), // turns 26 tomorrow (still 25 today)
    new Date("2000-07-05T00:00:00.000Z"), // turned 26 yesterday
    new Date("1991-01-15T00:00:00.000Z"),
    new Date("2008-12-31T00:00:00.000Z"),
  ];

  it.each(samples)("agrees with calculateAge() for %s across a range of windows", (birthDate) => {
    const windows: Array<[number, number]> = [
      [18, 25],
      [20, 30],
      [26, 26],
      [18, 99],
    ];
    for (const [minAge, maxAge] of windows) {
      const age = calculateAge(birthDate, now);
      expect(isWithinBounds(birthDate, minAge, maxAge)).toBe(age >= minAge && age <= maxAge);
    }
  });
});
