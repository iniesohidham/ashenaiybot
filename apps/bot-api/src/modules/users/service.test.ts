import { describe, expect, it } from "vitest";
import { deriveOnboardingStep } from "./service.js";

describe("deriveOnboardingStep", () => {
  it("starts at the age gate when nothing is set", () => {
    expect(deriveOnboardingStep({ ageAttestedAt: null, gender: null, birthDate: null })).toBe(
      "age_gate",
    );
  });

  it("moves to gender once the age gate is confirmed", () => {
    expect(deriveOnboardingStep({ ageAttestedAt: new Date(), gender: null, birthDate: null })).toBe(
      "gender",
    );
  });

  it("moves to birth date once gender is set", () => {
    expect(
      deriveOnboardingStep({ ageAttestedAt: new Date(), gender: "male", birthDate: null }),
    ).toBe("birth_date");
  });

  it("is complete once all three required fields are set", () => {
    expect(
      deriveOnboardingStep({ ageAttestedAt: new Date(), gender: "male", birthDate: new Date() }),
    ).toBe("complete");
  });
});
