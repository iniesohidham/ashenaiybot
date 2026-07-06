import { z } from "zod";

// Matches the bio length limit from EPIC 2 (US-2.4) so the REST API and the
// bot's own onboarding flow enforce the same rule.
export const upsertProfileSchema = z.object({
  displayBio: z.string().max(300).nullable().optional(),
  interests: z.array(z.string()).max(10).optional(),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;
