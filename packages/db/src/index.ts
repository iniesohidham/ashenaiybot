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
