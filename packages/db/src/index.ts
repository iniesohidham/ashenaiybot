import { PrismaClient } from "@prisma/client";

declare global {
  // Global singleton, avoids exhausting Postgres connections from
  // re-instantiating PrismaClient on every hot reload.
  var __ashenaPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__ashenaPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__ashenaPrisma = prisma;
}

// Consumers import model/enum types from here instead of depending on
// @prisma/client directly — this package is the single owner of Prisma.
export * from "@prisma/client";

/**
 * Match.userAId/userBId must always be written as the lexicographically
 * smaller id first (see schema.prisma) — the single source of truth for that
 * ordering so seed data and services can't drift on it.
 */
export function canonicalUserPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}
