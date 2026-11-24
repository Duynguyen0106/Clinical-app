import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  enterRlsTransaction,
  getRlsTx,
  runWithClinicRls,
  runWithRlsBypass,
  rlsAls,
} from "@/server/rls-als";

type Tx = Prisma.TransactionClient;

/**
 * SET LOCAL clinic tenant GUC inside a transaction (safe with connection pools).
 * Pair with prisma/sql/001_clinic_rls.sql policies.
 */
export async function setClinicRlsLocal(tx: Tx, clinicId: string) {
  await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'off', true)`;
}

export async function setRlsBypassLocal(tx: Tx) {
  await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
}

const DEFAULT_TX = { maxWait: 10_000, timeout: 25_000 } as const;

/**
 * Neon interactive `$transaction` on Cloudflare Workers reliably trips
 * error 1101/1102 ("Server temporarily unavailable"). Production Worker
 * uses `neondb_owner` (BYPASSRLS), so app-layer `clinicId` filters are
 * enough — skip interactive txs and run against the root client.
 *
 * Real interactive txs remain for `withScheduleLocks` (advisory locks).
 */
function skipInteractiveRlsTx() {
  return (
    process.env.CLOUDFLARE_WORKERS === "1" ||
    process.env.USE_NEON_ADAPTER === "1" ||
    process.env.SKIP_INTERACTIVE_RLS_TX === "1"
  );
}

/**
 * One interactive transaction for the whole request/job. Bare `prisma.*`
 * RLS-model queries reuse this tx via ALS (see db.ts extension) so we do not
 * open a Neon interactive transaction per query (Worker 5xx / timeouts).
 *
 * On Workers/Neon adapter this is a no-op wrapper (see skipInteractiveRlsTx).
 */
export async function withClinicRequest<T>(
  clinicId: string,
  fn: () => Promise<T>,
  client: PrismaClient = prisma,
  options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    maxWait?: number;
    timeout?: number;
  },
): Promise<T> {
  const existing = getRlsTx();
  const store = rlsAls.getStore();
  if (existing && store?.kind === "clinic" && store.depth > 0) {
    if (store.clinicId !== clinicId) {
      await setClinicRlsLocal(existing, clinicId);
    }
    return runWithClinicRls(clinicId, () =>
      enterRlsTransaction(fn, existing),
    );
  }

  if (skipInteractiveRlsTx()) {
    return runWithClinicRls(clinicId, fn);
  }

  return runWithClinicRls(clinicId, () =>
    client.$transaction(async (tx) => {
      await setClinicRlsLocal(tx, clinicId);
      return enterRlsTransaction(fn, tx);
    }, {
      maxWait: options?.maxWait ?? DEFAULT_TX.maxWait,
      timeout: options?.timeout ?? DEFAULT_TX.timeout,
      ...(options?.isolationLevel
        ? { isolationLevel: options.isolationLevel }
        : {}),
    }),
  );
}

export async function withRlsBypassRequest<T>(
  fn: () => Promise<T>,
  client: PrismaClient = prisma,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  const existing = getRlsTx();
  const store = rlsAls.getStore();
  if (existing && store?.kind === "bypass" && store.depth > 0) {
    return enterRlsTransaction(fn, existing);
  }

  if (skipInteractiveRlsTx()) {
    return runWithRlsBypass(fn);
  }

  return runWithRlsBypass(() =>
    client.$transaction(async (tx) => {
      await setRlsBypassLocal(tx);
      return enterRlsTransaction(fn, tx);
    }, {
      maxWait: options?.maxWait ?? DEFAULT_TX.maxWait,
      timeout: options?.timeout ?? 60_000,
    }),
  );
}

/**
 * Run work with clinic RLS context. On Workers, skips interactive Neon txs
 * (1102); reuses a parent tx when already inside withScheduleLocks / request.
 */
export async function withClinicTransaction<T>(
  clinicId: string,
  fn: (tx: Tx) => Promise<T>,
  client: PrismaClient = prisma,
  options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    maxWait?: number;
    timeout?: number;
  },
): Promise<T> {
  const existing = getRlsTx();
  const store = rlsAls.getStore();
  if (existing && store?.kind === "clinic" && store.depth > 0) {
    if (store.clinicId !== clinicId) {
      await setClinicRlsLocal(existing, clinicId);
    }
    return fn(existing);
  }

  if (skipInteractiveRlsTx()) {
    return runWithClinicRls(clinicId, () =>
      fn(client as unknown as Tx),
    );
  }

  return runWithClinicRls(clinicId, () =>
    client.$transaction(async (tx) => {
      await setClinicRlsLocal(tx, clinicId);
      return enterRlsTransaction(() => fn(tx), tx);
    }, options),
  );
}

export async function withRlsBypassTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  const existing = getRlsTx();
  const store = rlsAls.getStore();
  if (existing && store?.kind === "bypass" && store.depth > 0) {
    return fn(existing);
  }

  if (skipInteractiveRlsTx()) {
    return runWithRlsBypass(() => fn(client as unknown as Tx));
  }

  return runWithRlsBypass(() =>
    client.$transaction(async (tx) => {
      await setRlsBypassLocal(tx);
      return enterRlsTransaction(() => fn(tx), tx);
    }),
  );
}
