import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Request / job scoped RLS intent for the Prisma client extension.
 * When `tx` is set, bare RLS-model queries reuse that interactive transaction
 * (GUC already applied) instead of opening a new Neon transaction per op.
 * depth > 0 means we must not open another wrapping transaction.
 */
export type RlsStore =
  | { kind: "clinic"; clinicId: string; depth: number; tx?: Tx }
  | { kind: "bypass"; depth: number; tx?: Tx };

export const rlsAls = new AsyncLocalStorage<RlsStore>();

export function runWithClinicRls<T>(
  clinicId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const parent = rlsAls.getStore();
  const depth =
    parent && parent.kind === "clinic" ? Math.max(parent.depth, 0) : 0;
  const tx = parent && parent.kind === "clinic" ? parent.tx : undefined;
  return rlsAls.run({ kind: "clinic", clinicId, depth, tx }, fn);
}

export function runWithRlsBypass<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const parent = rlsAls.getStore();
  const tx = parent && parent.kind === "bypass" ? parent.tx : undefined;
  return rlsAls.run({ kind: "bypass", depth: 0, tx }, fn);
}

/** Mark that SET LOCAL is already active; optionally bind the interactive tx. */
export function enterRlsTransaction<T>(
  fn: () => T | Promise<T>,
  tx?: Tx,
): T | Promise<T> {
  const store = rlsAls.getStore();
  if (!store) return fn();
  return rlsAls.run(
    {
      ...store,
      depth: store.depth + 1,
      ...(tx ? { tx } : {}),
    },
    fn,
  );
}

export function getRlsTx(): Tx | undefined {
  return rlsAls.getStore()?.tx;
}
