import { calculateAge } from "@ashena/shared";
import type { Profile, User } from "@ashena/db";

/**
 * EPIC 6 — every REST response that could reach another user's client
 * (candidate cards, chat) goes through this shape, never the raw Prisma
 * `User`/`Profile` rows: strips telegramId/username/languageCode, the same
 * anonymity boundary the bot enforces by construction (it only ever sends
 * profile-derived copy, never ctx.from's Telegram fields, to the other
 * party). Age is derived fresh here, never persisted — same rule as
 * calculateAge()'s other callers.
 */
export interface PublicCandidate {
  id: string;
  gender: User["gender"];
  age: number | null;
  bio: string | null;
  interests: string[];
  hasApprovedPhoto: boolean;
}

export function toPublicCandidate(user: User, profile: Profile | null): PublicCandidate {
  return {
    id: user.id,
    gender: user.gender,
    age: user.birthDate ? calculateAge(user.birthDate) : null,
    bio: profile?.displayBio ?? null,
    interests: profile?.interests ?? [],
    hasApprovedPhoto: profile?.photoModerationStatus === "approved" && Boolean(profile.photoUrl),
  };
}
