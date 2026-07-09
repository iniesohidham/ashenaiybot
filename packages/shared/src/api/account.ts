import { z } from "zod";
import { isAdult } from "../onboarding.js";

// EPIC 6 (US-6.3) — gender/birthDate live on User, not Profile (see
// upsertProfileSchema in ./profile.js for the Profile-only fields), but the
// bot already lets a user re-edit both post-onboarding (bot/keyboards.ts's
// edit menu: CB.editGender/CB.editBirthDate) — this is the same capability
// for the Mini App's profile screen, not a new one. birthDate arrives as a
// plain ISO date string (a web <input type="date"> gives one natively) and
// is validated with the same isAdult() rule onboarding/the bot's edit flow
// already enforce, so a user can't set themselves under 18 either way.
export const updateAccountSchema = z.object({
  gender: z.enum(["male", "female", "other"]).optional(),
  birthDate: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date." })
    .refine((value) => new Date(value).getTime() <= Date.now(), { message: "Birth date cannot be in the future." })
    .refine((value) => isAdult(new Date(value)), { message: "Must be 18 or older." })
    .optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
