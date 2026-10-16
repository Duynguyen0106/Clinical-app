import type { PrismaClient } from "@/generated/prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/**
 * Serialize diary mutations for one practitioner (and optionally room)
 * so check-then-insert races cannot double-book.
 * When clinicId is set, also SET LOCAL app.clinic_id for FORCE RLS paths.
 */
export async function withScheduleLocks<T>(
  prisma: PrismaClient,
  keys: {
    practitionerId: string;
    roomId?: string | null;
    clinicId?: string;
  },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    if (keys.clinicId) {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${keys.clinicId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'off', true)`;
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`practitioner:${keys.practitionerId}`}))`;
    if (keys.roomId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`room:${keys.roomId}`}))`;
    }
    return fn(tx as Tx);
  });
}
