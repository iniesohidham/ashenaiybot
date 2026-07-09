import { z } from "zod";
import { MIN_AGE } from "../onboarding.js";
import { MAX_PREFERENCE_AGE } from "../matching.js";

// Mirrors the bot's guided age-range/gender-preference edit flow (EPIC 3,
// US-3.1) so the Mini App's settings form (EPIC 6, US-6.6) enforces the same
// bounds as upsertPreference()'s callers — see G5 dual-surface parity.
export const upsertPreferenceSchema = z
  .object({
    interestedInGenders: z.array(z.enum(["male", "female", "other"])).min(1),
    minAge: z.number().int().min(MIN_AGE).max(MAX_PREFERENCE_AGE),
    maxAge: z.number().int().min(MIN_AGE).max(MAX_PREFERENCE_AGE),
  })
  .refine((input) => input.minAge <= input.maxAge, {
    message: "minAge must be less than or equal to maxAge",
    path: ["minAge"],
  });

export type UpsertPreferenceInput = z.infer<typeof upsertPreferenceSchema>;
