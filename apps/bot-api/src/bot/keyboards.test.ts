import { describe, expect, it } from "vitest";
import { MAX_INTERESTS } from "@ashena/shared";
import {
  candidateSwipeId,
  genderPreferenceKeyboard,
  genderPreferenceToggleValue,
  getSelectedGenderPreferences,
  getSelectedInterests,
  interestsKeyboard,
  matchIdFromStartCallback,
  setsAreEqual,
  toggleGenderPreference,
  toggleInterest,
} from "./keyboards.js";

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

describe("genderPreferenceKeyboard / getSelectedGenderPreferences round-trip", () => {
  it("round-trips a single selection", () => {
    const keyboard = genderPreferenceKeyboard(new Set(["male"]));
    expect(getSelectedGenderPreferences(keyboard.inline_keyboard)).toEqual(["male"]);
  });

  it("round-trips multiple selections", () => {
    const keyboard = genderPreferenceKeyboard(new Set(["male", "other"]));
    expect(getSelectedGenderPreferences(keyboard.inline_keyboard).sort()).toEqual(["male", "other"]);
  });

  it("returns an empty list for undefined rows", () => {
    expect(getSelectedGenderPreferences(undefined)).toEqual([]);
  });
});

describe("toggleGenderPreference", () => {
  it("adds a value that isn't selected yet", () => {
    const result = toggleGenderPreference(new Set(["male"]), "female");
    expect(result.has("female")).toBe(true);
  });

  it("removes a value that is already selected, above the floor", () => {
    const result = toggleGenderPreference(new Set(["male", "female"]), "female");
    expect(result.has("female")).toBe(false);
  });

  it("refuses to drop the last remaining selection", () => {
    const result = toggleGenderPreference(new Set(["male"]), "male");
    expect(result.has("male")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("returns an unchanged set (by value) when rejecting the last selection", () => {
    const atFloor = new Set<"male" | "female" | "other">(["other"]);
    const result = toggleGenderPreference(atFloor, "other");
    expect(setsAreEqual(result, atFloor)).toBe(true);
  });
});

describe("candidateSwipeId", () => {
  it("parses a like callback", () => {
    expect(candidateSwipeId("swipe:like:abc123")).toEqual({ candidateId: "abc123", isLike: true });
  });

  it("parses a pass callback", () => {
    expect(candidateSwipeId("swipe:pass:abc123")).toEqual({ candidateId: "abc123", isLike: false });
  });

  it("returns null for unrelated data", () => {
    expect(candidateSwipeId("menu:find")).toBeNull();
  });
});

describe("matchIdFromStartCallback", () => {
  it("parses a match:start callback", () => {
    expect(matchIdFromStartCallback("match:start:xyz789")).toBe("xyz789");
  });

  it("returns null for unrelated data", () => {
    expect(matchIdFromStartCallback("menu:find")).toBeNull();
  });
});

describe("genderPreferenceToggleValue", () => {
  it("parses a valid gender toggle", () => {
    expect(genderPreferenceToggleValue("pref:gender:t:male")).toBe("male");
  });

  it("returns null for the done callback (not a toggle)", () => {
    expect(genderPreferenceToggleValue("pref:gender:done")).toBeNull();
  });

  it("returns null for an invalid gender value", () => {
    expect(genderPreferenceToggleValue("pref:gender:t:bogus")).toBeNull();
  });

  it("returns null for unrelated data", () => {
    expect(genderPreferenceToggleValue("menu:find")).toBeNull();
  });
});
