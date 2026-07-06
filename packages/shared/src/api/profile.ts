import { z } from "zod";
import { BIO_MAX_LENGTH, INTEREST_VALUES, MAX_INTERESTS } from "../onboarding.js";

// Shares its limits and fixed interest list with the bot's onboarding flow
// (EPIC 2, US-2.4) via ../onboarding.js so the REST API and the bot enforce
// the same rule — see G5 dual-surface parity.
export const upsertProfileSchema = z.object({
  displayBio: z.string().max(BIO_MAX_LENGTH).nullable().optional(),
  interests: z.array(z.enum(INTEREST_VALUES)).max(MAX_INTERESTS).optional(),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;
