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

export function upsertProfile(userId: string, input: UpsertProfileInput): Promise<Profile> {
  return prisma.profile.upsert({
    where: { userId },
    update: input,
    create: { userId, ...input },
  });
}
