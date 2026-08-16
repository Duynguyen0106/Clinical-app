import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

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

/**
 * Run work in a transaction with clinic RLS context set.
 * App-layer clinicId filters remain the primary guard; this is defense in depth
 * once policies are applied and (optionally) FORCE + non-owner DB role are used.
 */
export async function withClinicTransaction<T>(
  clinicId: string,
  fn: (tx: Tx) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await setClinicRlsLocal(tx, clinicId);
    return fn(tx);
  });
}

export async function withRlsBypassTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await setRlsBypassLocal(tx);
    return fn(tx);
  });
}
