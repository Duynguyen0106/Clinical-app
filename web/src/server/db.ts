import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function isNeonConnection(connectionString: string) {
  if (process.env.USE_NEON_ADAPTER === "1") return true;
  try {
    const host = new URL(connectionString).hostname;
    return host.includes("neon.tech") || host.includes("neon.cloud");
  } catch {
    return connectionString.includes("neon.tech");
  }
}

/** Cloudflare Workers cannot open TCP `pg` pools. */
function mustUseServerlessDriver() {
  return (
    process.env.USE_NEON_ADAPTER === "1" ||
    process.env.CLOUDFLARE_WORKERS === "1" ||
    typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !==
      "undefined"
  );
}

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (isNeonConnection(connectionString) || mustUseServerlessDriver()) {
    // Neon serverless HTTP — works on Cloudflare Workers (no TCP pg pool).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaNeonHttp } =
      require("@prisma/adapter-neon") as typeof import("@prisma/adapter-neon");
    const adapter = new PrismaNeonHttp(connectionString, {
      arrayMode: false,
      fullResults: true,
    });
    return new PrismaClient({ adapter });
  }

  // Local / classic Postgres via TCP pool
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require("pg") as typeof import("pg");
  const pool = new pg.Pool({
    connectionString,
    max: 10,
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

/**
 * Lazy Prisma accessor so Next.js can collect page data during builds
 * without requiring DATABASE_URL at module import time.
 * Cached on globalThis in all environments to avoid connection churn.
 * Neon hosts (and Cloudflare Workers) use the serverless driver.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = globalForPrisma.prisma ?? createPrisma();
    globalForPrisma.prisma = client;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
