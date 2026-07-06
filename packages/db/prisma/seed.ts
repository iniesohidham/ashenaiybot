import { faker } from "@faker-js/faker";
import { Gender, PrismaClient, type User } from "@prisma/client";

const prisma = new PrismaClient();

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

/** Match.userAId/userBId must be a canonical (sorted) pair — see schema.prisma. */
function canonicalPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

async function seedMatches(users: User[]): Promise<void> {
  const activePairs: Array<[User, User]> = [
    [users[0], users[1]],
    [users[2], users[3]],
    [users[4], users[5]],
  ];
  for (const [userA, userB] of activePairs) {
    const [a, b] = canonicalPair(userA.id, userB.id);
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
    const [a, b] = canonicalPair(userA.id, userB.id);
    await prisma.match.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      update: {},
      create: { userAId: a, userBId: b, status: "ended", endedReason: "ended by seed script" },
    });
  }
}

async function seedReports(users: User[]): Promise<void> {
  const reporter = users[10];
  const reported = users[11];

  const existing = await prisma.report.findFirst({
    where: { reporterId: reporter.id, reportedUserId: reported.id, reason: "spam" },
  });
  if (existing) return;

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

async function main(): Promise<void> {
  const users = await seedUsers(20);
  await seedMatches(users);
  await seedReports(users);
  console.log(`Seeded ${users.length} users, 5 matches (3 active/2 ended), 1 pending report.`);
}

main()
  .catch((err: unknown) => {
    console.error("[seed] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
