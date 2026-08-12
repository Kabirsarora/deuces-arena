import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error("DATABASE_URL is required to initialize the database client.");
  }

  return databaseUrl;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: getDatabaseUrl()
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type {
  CoachEvaluation,
  Cosmetic,
  Match,
  MatchPlayer,
  MoveEvent,
  PushDeliveryTicket,
  PushSubscription,
  ReplayLabel,
  User,
  UserCosmeticUnlock,
  UserEquippedCosmetic
} from "@prisma/client";
export type { Prisma } from "@prisma/client";
