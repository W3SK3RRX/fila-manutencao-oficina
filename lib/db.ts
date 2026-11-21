import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Prisma 7 requires an explicit driver adapter (no bundled query engine
// binary); see https://pris.ly/d/driver-adapters.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Prisma Client singleton. Next.js hot-reloads modules in dev, which would
// otherwise create a new PrismaClient (and a new connection pool) on every
// edit. Caching the instance on `globalThis` survives module reloads.
//
// Every file that needs database access must import `prisma` from here —
// no other file may call `new PrismaClient()`.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
