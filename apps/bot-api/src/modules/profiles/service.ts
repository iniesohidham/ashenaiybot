import { prisma, type ModerationStatus, type Profile } from "@ashena/db";

export function findProfileByUserId(userId: string): Promise<Profile | null> {
  return prisma.profile.findUnique({ where: { userId } });
}

export interface UpsertProfileInput {
  displayBio?: string | null;
  interests?: string[];
  photoUrl?: string | null;
  photoModerationStatus?: ModerationStatus;
}

/**
 * A new photoUrl always stamps photoSubmittedAt (US-5.2's photo queue
 * ordering) — done here, the single write path for Profile, rather than at
 * each caller (onboarding.ts's photo step today; any future Mini App photo
 * upload tomorrow), so the two surfaces can't drift on this.
 */
export function upsertProfile(userId: string, input: UpsertProfileInput): Promise<Profile> {
  const data = input.photoUrl !== undefined ? { ...input, photoSubmittedAt: new Date() } : input;
  return prisma.profile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}
