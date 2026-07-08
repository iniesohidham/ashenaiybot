import { faker } from "@faker-js/faker";
import { Gender, type User } from "@prisma/client";
import { calculateAge, defaultAgeRange, defaultInterestedInGenders, type GenderValue } from "@ashena/shared";
import { canonicalUserPair, prisma } from "../src/index.js";

const INTERESTS = [
  "music",
  "movies",
  "travel",
  "sports",
  "reading",
  "gaming",
  "cooking",
  "art",
  "fitness",
  "photography",
];

// Deterministic telegramIds (not random) so re-running upserts the same 20
// users instead of creating new ones — that's what makes this idempotent.
const SEED_TELEGRAM_ID_BASE = 1_000_000_000n;

function randomBirthDate(): Date {
  const age = faker.number.int({ min: 18, max: 45 });
  const now = new Date();
  return new Date(
    now.getFullYear() - age,
    faker.number.int({ min: 0, max: 11 }),
    faker.number.int({ min: 1, max: 28 }),
  );
}

function randomGender(): Gender {
  return faker.helpers.arrayElement([Gender.male, Gender.female, Gender.other]);
}

function randomInterests(): string[] {
  return faker.helpers.arrayElements(INTERESTS, { min: 0, max: 4 });
}

async function seedUsers(count: number): Promise<User[]> {
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    const telegramId = SEED_TELEGRAM_ID_BASE + BigInt(i);
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {},
      create: {
        telegramId,
        gender: randomGender(),
        birthDate: randomBirthDate(),
        languageCode: faker.helpers.arrayElement(["fa", "en"]),
        ageAttestedAt: new Date(),
        profile: {
          create: {
            displayBio: faker.lorem.sentence(),
            interests: randomInterests(),
            photoModerationStatus: "approved",
          },
        },
      },
    });
    users.push(user);
  }
  return users;
}

/**
 * Separate upsert (rather than nested in seedUsers' create) so re-running
 * this script backfills MatchPreference for users seeded before EPIC 3 too —
 * a nested `create` only fires on the user's own first insert.
 */
async function seedMatchPreferences(users: User[]): Promise<void> {
  for (const user of users) {
    if (!user.gender || !user.birthDate) continue;
    const age = calculateAge(user.birthDate);
    await prisma.matchPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        interestedInGenders: defaultInterestedInGenders(user.gender as GenderValue),
        ...defaultAgeRange(age),
      },
    });
  }
}

async function seedMatches(users: User[]): Promise<void> {
  const activePairs: Array<[User, User]> = [
    [users[0], users[1]],
    [users[2], users[3]],
    [users[4], users[5]],
  ];
  for (const [userA, userB] of activePairs) {
    const [a, b] = canonicalUserPair(userA.id, userB.id);
    await prisma.match.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      update: {},
      create: { userAId: a, userBId: b, status: "active" },
    });
  }

  const endedPairs: Array<[User, User]> = [
    [users[6], users[7]],
    [users[8], users[9]],
  ];
  for (const [userA, userB] of endedPairs) {
    const [a, b] = canonicalUserPair(userA.id, userB.id);
    await prisma.match.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      update: {},
      create: { userAId: a, userBId: b, status: "ended", endedReason: "ended by seed script" },
    });
  }
}

/**
 * EPIC 7 (Admin Panel) owns real admin auth/login — this row exists purely so
 * BanRecord.issuedByAdminId has a valid FK to seed/test against before then.
 * The passwordHash is an obvious, unusable placeholder, not a real credential.
 */
async function seedSystemAdmin(): Promise<void> {
  await prisma.adminUser.upsert({
    where: { username: "system" },
    update: {},
    create: {
      username: "system",
      passwordHash: "epic7-not-yet-implemented",
      role: "admin",
    },
  });
}

/**
 * EPIC 5 (US-5.1, minimal slice) — a small illustrative starting point for
 * the DB-backed banned-word list, not an attempt at a real profanity list.
 * Editable via the Admin Panel once EPIC 7 ships.
 */
async function seedBannedPatterns(): Promise<void> {
  const starterPatterns: Array<{ pattern: string; severity: "normal" | "high" }> = [
    { pattern: "spamword", severity: "normal" },
    { pattern: "badword", severity: "normal" },
    { pattern: "زیر ۱۸", severity: "high" },
  ];
  for (const { pattern, severity } of starterPatterns) {
    const existing = await prisma.bannedPattern.findFirst({ where: { pattern } });
    if (existing) continue;
    await prisma.bannedPattern.create({ data: { pattern, severity } });
  }
}

/**
 * Gives one of the 3 "active" seeded matches a live ChatSession with a couple
 * of messages, so manual live-bot testing (EPIC 4) has a session to resume/
 * end/report/block against immediately after seeding, without needing to
 * swipe through the matching flow first.
 */
async function seedChatSession(users: User[]): Promise<void> {
  const [userA, userB] = canonicalUserPair(users[0].id, users[1].id);
  const match = await prisma.match.findUnique({ where: { userAId_userBId: { userAId: userA, userBId: userB } } });
  if (!match) return;

  const existing = await prisma.chatSession.findFirst({ where: { matchId: match.id } });
  if (existing) return;

  const session = await prisma.chatSession.create({ data: { matchId: match.id } });
  await prisma.message.createMany({
    data: [
      { sessionId: session.id, senderUserId: userA, type: "text", contentRef: "سلام! چطوری؟" },
      { sessionId: session.id, senderUserId: userB, type: "text", contentRef: "سلام، خوبم! تو چطوری؟" },
    ],
  });
}

async function seedReports(users: User[], systemAdminId: string): Promise<void> {
  const reporter = users[10];
  const reported = users[11];

  const existing = await prisma.report.findFirst({
    where: { reporterId: reporter.id, reportedUserId: reported.id, reason: "spam" },
  });
  if (!existing) {
    await prisma.report.create({
      data: {
        reporterId: reporter.id,
        reportedUserId: reported.id,
        reason: "spam",
        severity: "normal",
        status: "pending",
      },
    });
  }

  // EPIC 5 (US-5.3) — one already-resolved report, so getReportSlaStats()/
  // listReportQueue() have non-trivial data to compute against immediately
  // after seeding, not just the one still-pending report above.
  const resolvedReporter = users[14];
  const resolvedReported = users[15];
  const existingResolved = await prisma.report.findFirst({
    where: { reporterId: resolvedReporter.id, reportedUserId: resolvedReported.id, reason: "harassment" },
  });
  if (!existingResolved) {
    const createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await prisma.report.create({
      data: {
        reporterId: resolvedReporter.id,
        reportedUserId: resolvedReported.id,
        reason: "harassment",
        severity: "normal",
        status: "actioned",
        createdAt,
        resolvedAt: new Date(),
        resolvedByAdminId: systemAdminId,
        resolutionAction: "warn",
      },
    });
  }
}

/**
 * EPIC 5 (US-5.2) — one profile with a photo still awaiting review, so
 * listPendingPhotos() has data immediately after seeding (there's no
 * automated classifier — see modules/moderation/service.ts — every uploaded
 * photo lands here until a moderator decision).
 */
async function seedPendingPhoto(users: User[]): Promise<void> {
  const user = users[12];
  await prisma.profile.update({
    where: { userId: user.id },
    data: {
      photoUrl: "seed-placeholder-file-id",
      photoModerationStatus: "pending",
      photoSubmittedAt: new Date(),
    },
  });
}

/**
 * EPIC 5 (US-5.4/5.5) — one banned user with a pending appeal, so
 * listPendingBanAppeals() has data immediately after seeding.
 */
async function seedBanAppeal(users: User[], systemAdminId: string): Promise<void> {
  const user = users[13];
  if (user.status !== "banned") {
    await prisma.user.update({ where: { id: user.id }, data: { status: "banned" } });
  }
  const banRecord = await prisma.banRecord.upsert({
    where: { id: `seed-ban-${user.id}` },
    update: {},
    create: {
      id: `seed-ban-${user.id}`,
      userId: user.id,
      reason: "seed: illustrative temporary ban",
      type: "temporary",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      issuedByAdminId: systemAdminId,
    },
  });
  await prisma.banAppeal.upsert({
    where: { banRecordId: banRecord.id },
    update: {},
    create: {
      banRecordId: banRecord.id,
      userId: user.id,
      message: "به نظرم این بن اشتباهیه، لطفاً بررسی کنید.",
    },
  });
}

async function main(): Promise<void> {
  const users = await seedUsers(20);
  await seedMatchPreferences(users);
  await seedMatches(users);
  await seedSystemAdmin();
  const systemAdmin = await prisma.adminUser.findUniqueOrThrow({ where: { username: "system" } });
  await seedReports(users, systemAdmin.id);
  await seedBannedPatterns();
  await seedChatSession(users);
  await seedPendingPhoto(users);
  await seedBanAppeal(users, systemAdmin.id);
  console.log(
    `Seeded ${users.length} users, 5 matches (3 active/2 ended), 1 pending + 1 resolved report, ` +
      `1 system admin, 3 banned patterns, 1 active chat session with 2 messages, ` +
      `1 pending photo review, 1 banned user with a pending appeal.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error("[seed] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
