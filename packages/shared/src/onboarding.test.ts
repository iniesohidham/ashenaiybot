import { describe, expect, it } from "vitest";
import { calculateAge, isAdult, parseBirthDateInput } from "./onboarding.js";

describe("calculateAge", () => {
  it("counts a full year as one year older", () => {
    const birthDate = new Date(Date.UTC(2000, 4, 20));
    const now = new Date(Date.UTC(2024, 4, 20));
    expect(calculateAge(birthDate, now)).toBe(24);
  });

  it("does not count a birthday that hasn't happened yet this year", () => {
    const birthDate = new Date(Date.UTC(2000, 4, 20));
    const now = new Date(Date.UTC(2024, 4, 19));
    expect(calculateAge(birthDate, now)).toBe(23);
  });
});

describe("isAdult", () => {
  it("is false the day before the 18th birthday", () => {
    const birthDate = new Date(Date.UTC(2006, 6, 6));
    const now = new Date(Date.UTC(2024, 6, 5));
    expect(isAdult(birthDate, now)).toBe(false);
  });

  it("is true on the 18th birthday", () => {
    const birthDate = new Date(Date.UTC(2006, 6, 6));
    const now = new Date(Date.UTC(2024, 6, 6));
    expect(isAdult(birthDate, now)).toBe(true);
  });
});

describe("parseBirthDateInput", () => {
  const now = new Date(Date.UTC(2024, 6, 6));

  it("accepts a hyphen-separated ISO date", () => {
    const result = parseBirthDateInput("2000-05-20", now);
    expect(result).toEqual({ ok: true, birthDate: new Date(Date.UTC(2000, 4, 20)) });
  });

  it("accepts a slash-separated date", () => {
    const result = parseBirthDateInput("2000/05/20", now);
    expect(result).toEqual({ ok: true, birthDate: new Date(Date.UTC(2000, 4, 20)) });
  });

  it("accepts Persian digits", () => {
    const result = parseBirthDateInput("۲۰۰۰-۰۵-۲۰", now);
    expect(result).toEqual({ ok: true, birthDate: new Date(Date.UTC(2000, 4, 20)) });
  });

  it("accepts Arabic-Indic digits", () => {
    const result = parseBirthDateInput("٢٠٠٠-٠٥-٢٠", now);
    expect(result).toEqual({ ok: true, birthDate: new Date(Date.UTC(2000, 4, 20)) });
  });

  it("rejects unparseable text", () => {
    expect(parseBirthDateInput("not a date", now)).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("rejects a calendar date that doesn't exist", () => {
    expect(parseBirthDateInput("2001-02-30", now)).toEqual({ ok: false, reason: "invalid_date" });
  });

  it("rejects a date in the future", () => {
    expect(parseBirthDateInput("2099-01-01", now)).toEqual({ ok: false, reason: "future_date" });
  });

  it("rejects an implausibly old birth year", () => {
    expect(parseBirthDateInput("0001-01-01", now)).toEqual({ ok: false, reason: "invalid_date" });
  });
});
