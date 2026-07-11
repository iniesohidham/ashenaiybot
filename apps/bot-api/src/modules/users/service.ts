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
 *
 * EPIC 8 (US-8.4): also the single choke point both surfaces (bot via
 * identityMiddleware.ts, Mini App via miniAppAuth.ts) already resolve
 * identity through on every request — stamping `lastActiveAt` here means
 * the inactivity-nudge job's "who's idle" query needs no separate
 * per-message/per-swipe tracking call anywhere else. This does write on
 * every single request rather than only when stale (an adversarial review
 * flagged the write-amplification cost on the app's highest-frequency code
 * path) — accepted deliberately: the alternative (skip the write unless
 * `lastActiveAt` is already more than a few minutes old) needs a read
 * before the write, which costs more than the single indexed-PK timestamp
 * UPDATE it would save at this product's current volume. Revisit if this
 * ever shows up as a real cost, same "simple and fine at early-stage
 * product volumes" bar the rest of this codebase already applies elsewhere
 * (e.g. getDashboardMetrics's per-day query loop).
 */
export function findOrCreateUserByTelegramId(params: {
  telegramId: bigint;
  languageCode?: string;
}): Promise<User> {
  return prisma.user.upsert({
    where: { telegramId: params.telegramId },
    update: { lastActiveAt: new Date() },
    create: {
      telegramId: params.telegramId,
      languageCode: params.languageCode,
      lastActiveAt: new Date(),
    },
  });
}

export interface UpdateUserInput {
  gender?: Gender;
  birthDate?: Date;
  languageCode?: string;
  ageAttestedAt?: Date;
  status?: UserStatus;
  notificationsOptedOut?: boolean;
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return prisma.user.update({ where: { id }, data: input });
}

/**
 * EPIC 6 (US-6.6) account deletion. A soft delete, not `prisma.user.delete` —
 * most of User's relations are `onDelete: Cascade`, which would wipe
 * Report/BanRecord history other moderation queries rely on as an audit
 * trail. Flips `status` to `deleted` (identityMiddleware.ts short-circuits
 * this the same way it already does `banned`, so the account genuinely can't
 * keep being used afterward) and scrubs Profile content immediately.
 * Deleting the MatchPreference row reuses the exact mechanism that already
 * makes a user invisible as a candidate to everyone else (see
 * matching/service.ts's queryCandidateIds) — no separate "hidden" flag
 * needed. Ending any active chat session and clearing Redis browsing state
 * is the caller's job (route-level orchestration), same "one service doesn't
 * reach into another's concern" pattern chat/moderation already follow.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "deleted" } }),
    prisma.profile.updateMany({
      where: { userId },
      data: { displayBio: null, interests: [], photoUrl: null, photoModerationStatus: "pending" },
    }),
    prisma.matchPreference.deleteMany({ where: { userId } }),
  ]);
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
