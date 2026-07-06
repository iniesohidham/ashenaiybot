import { describe, expect, it } from "vitest";
import { MAX_INTERESTS } from "@ashena/shared";
import { getSelectedInterests, interestsKeyboard, setsAreEqual, toggleInterest } from "./keyboards.js";

describe("interestsKeyboard / getSelectedInterests round-trip", () => {
  it("round-trips an empty selection", () => {
    const keyboard = interestsKeyboard(new Set());
    expect(getSelectedInterests(keyboard.inline_keyboard)).toEqual([]);
  });

  it("round-trips a non-empty selection", () => {
    const selected = new Set(["music", "books"]);
    const keyboard = interestsKeyboard(selected);
    expect(getSelectedInterests(keyboard.inline_keyboard).sort()).toEqual(["books", "music"]);
  });

  it("returns an empty list for undefined rows", () => {
    expect(getSelectedInterests(undefined)).toEqual([]);
  });
});

describe("toggleInterest", () => {
  it("adds a value that isn't selected yet", () => {
    const result = toggleInterest(new Set(), "music");
    expect(result.has("music")).toBe(true);
  });

  it("removes a value that is already selected", () => {
    const result = toggleInterest(new Set(["music"]), "music");
    expect(result.has("music")).toBe(false);
  });

  it("does not add past MAX_INTERESTS", () => {
    const atCap = new Set(Array.from({ length: MAX_INTERESTS }, (_, i) => `tag-${i}`));
    const result = toggleInterest(atCap, "one-too-many");
    expect(result.has("one-too-many")).toBe(false);
    expect(result.size).toBe(MAX_INTERESTS);
  });

  it("returns an unchanged set (by value) when rejecting past the cap", () => {
    const atCap = new Set(Array.from({ length: MAX_INTERESTS }, (_, i) => `tag-${i}`));
    const result = toggleInterest(atCap, "one-too-many");
    expect(setsAreEqual(result, atCap)).toBe(true);
  });
});

describe("setsAreEqual", () => {
  it("is true for two empty sets", () => {
    expect(setsAreEqual(new Set(), new Set())).toBe(true);
  });

  it("is true for sets with the same values", () => {
    expect(setsAreEqual(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
  });

  it("is false for sets of different sizes", () => {
    expect(setsAreEqual(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
  });

  it("is false for same-size sets with different values", () => {
    expect(setsAreEqual(new Set(["a"]), new Set(["b"]))).toBe(false);
  });
});
