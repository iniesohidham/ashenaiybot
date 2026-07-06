import { prisma, type Gender, type User, type UserStatus } from "@ashena/db";

export function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function findUserByTelegramId(telegramId: bigint): Promise<User | null> {
  return prisma.user.findUnique({ where: { telegramId } });
}

/**
 * Finds the User for a Telegram id, creating a bare record on first contact
 * (gender/birthDate are collected later by EPIC 2 onboarding). Uses upsert
 * so concurrent first contacts (e.g. double /start) can't race into two rows.
 */
export function findOrCreateUserByTelegramId(params: {
  telegramId: bigint;
  languageCode?: string;
}): Promise<User> {
  return prisma.user.upsert({
    where: { telegramId: params.telegramId },
    update: {},
    create: {
      telegramId: params.telegramId,
      languageCode: params.languageCode,
    },
  });
}

export interface UpdateUserInput {
  gender?: Gender;
  birthDate?: Date;
  languageCode?: string;
  ageAttestedAt?: Date;
  status?: UserStatus;
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return prisma.user.update({ where: { id }, data: input });
}

export type OnboardingStep = "age_gate" | "gender" | "birth_date" | "complete";

/**
 * Derives which required onboarding step (EPIC 2, US-2.1..2.3) a user is on
 * from persisted fields alone — no separate "onboarding complete" flag, per
 * the data model note in CLAUDE.md. This is what lets `/start`/`/menu`
 * resume a user exactly where they left off after a restart.
 */
export function deriveOnboardingStep(
  user: Pick<User, "ageAttestedAt" | "gender" | "birthDate">,
): OnboardingStep {
  if (!user.ageAttestedAt) return "age_gate";
  if (!user.gender) return "gender";
  if (!user.birthDate) return "birth_date";
  return "complete";
}
