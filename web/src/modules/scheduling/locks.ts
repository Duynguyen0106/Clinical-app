import type { PrismaClient } from "@/generated/prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/**
 * Serialize diary mutations for one practitioner (and optionally room)
 * so check-then-insert races cannot double-book.
 */
export async function withScheduleLocks<T>(
  prisma: PrismaClient,
  keys: { practitionerId: string; roomId?: string | null },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`practitioner:${keys.practitionerId}`}))`;
    if (keys.roomId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`room:${keys.roomId}`}))`;
    }
    return fn(tx as Tx);
  });
}
