import { PrismaClient } from "@/generated/prisma/client";
import { enterRlsTransaction, rlsAls } from "@/server/rls-als";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/** Tables with ENABLE/FORCE clinic RLS — bare queries need app.clinic_id GUC. */
const RLS_MODELS = new Set([
  "Patient",
  "Appointment",
  "WaitlistEntry",
  "Invoice",
  "PatientAccessEvent",
  "NoteTemplate",
  "AiOrganiseJob",
  "Visit",
  "ClinicalNote",
  "Recording",
  "Transcript",
  "AppointmentAuditEvent",
  "NoteAuditEvent",
  "PatientConsent",
  "PatientIntakeSubmission",
  "LeaveRequest",
  "Room",
  "Payment",
]);

function modelDelegateKey(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

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

/** Neon WS / Worker isolate blips that usually succeed on a short retry. */
export function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (
    code === "P1001" ||
    code === "P1008" ||
    code === "P1017" ||
    code === "P2024"
  ) {
    return true;
  }
  return /1101|Network connection lost|Connection reset|WebSocket|ECONNRESET|ETIMEDOUT|timed out|Too many connections|server closed the connection|Connection terminated/i.test(
    msg,
  );
}

export async function withNeonRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransientDbError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 40 * Math.pow(2, i)));
    }
  }
  throw last;
}

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  let base: PrismaClient;

  if (isNeonConnection(connectionString) || mustUseServerlessDriver()) {
    // Neon serverless WebSocket driver — required for interactive transactions
    // ($transaction / withClinicTransaction / withScheduleLocks). HTTP mode
    // throws "Transactions are not supported in HTTP mode" on Workers.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaNeon } =
      require("@prisma/adapter-neon") as typeof import("@prisma/adapter-neon");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const neon = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
    if (typeof WebSocket === "undefined") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ws = require("ws") as typeof import("ws");
        neon.neonConfig.webSocketConstructor = ws.default ?? ws;
      } catch {
        /* Cloudflare Workers provide WebSocket */
      }
    }
    // maxUses: 1 — Workers hang/1101 when a pooled Neon WS client is reused
    // across requests in the same isolate (pg-pool release + borrow).
    const adapter = new PrismaNeon({ connectionString, maxUses: 1 });
    base = new PrismaClient({ adapter });
  } else {
    // Local / classic Postgres via TCP pool
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } =
      require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pg = require("pg") as typeof import("pg");
    const pool = new pg.Pool({
      connectionString,
      max: 10,
    });
    base = new PrismaClient({ adapter: new PrismaPg(pool) });
  }

  // Retry transient Neon/Worker failures. Prefer the request-scoped tx from ALS
  // (withClinicRequest); only open a one-shot SET LOCAL tx when intent is set
  // without an active tx (legacy callers of runWithClinicRls alone).
  return base.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        return withNeonRetry(async () => {
          const store = rlsAls.getStore();
          if (
            !store ||
            !model ||
            !RLS_MODELS.has(model) ||
            operation.startsWith("$")
          ) {
            return query(args);
          }

          const key = modelDelegateKey(model);
          const runOn = (tx: {
            [k: string]: Record<string, (a: unknown) => Promise<unknown>>;
          }) => {
            const delegate = tx[key];
            if (!delegate || typeof delegate[operation] !== "function") {
              return query(args);
            }
            return delegate[operation](args);
          };

          if (store.tx) {
            return runOn(
              store.tx as unknown as {
                [k: string]: Record<string, (a: unknown) => Promise<unknown>>;
              },
            );
          }

          if (store.depth > 0) {
            // Inside a tx helper that did not bind ALS.tx — do not nest.
            return query(args);
          }

          return enterRlsTransaction(() =>
            base.$transaction(async (tx) => {
              if (store.kind === "clinic") {
                await tx.$executeRaw`SELECT set_config('app.clinic_id', ${store.clinicId}, true)`;
                await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'off', true)`;
              } else {
                await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
              }
              return runOn(
                tx as unknown as {
                  [k: string]: Record<
                    string,
                    (a: unknown) => Promise<unknown>
                  >;
                },
              );
            }),
          );
        });
      },
    },
  }) as unknown as PrismaClient;
}

/**
 * Lazy Prisma accessor so Next.js can collect page data during builds
 * without requiring DATABASE_URL at module import time.
 * Cached on globalThis to avoid connection churn outside Workers;
 * Neon Pool uses maxUses:1 so isolate reuse cannot hang on a borrowed client.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = globalForPrisma.prisma ?? createPrisma();
    globalForPrisma.prisma = client;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
