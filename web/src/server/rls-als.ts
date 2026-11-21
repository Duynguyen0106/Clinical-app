import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request / job scoped RLS intent for the Prisma client extension.
 * depth > 0 means we are already inside a withClinicTransaction /
 * extension-wrapped interactive transaction — do not nest another.
 */
export type RlsStore =
  | { kind: "clinic"; clinicId: string; depth: number }
  | { kind: "bypass"; depth: number };

export const rlsAls = new AsyncLocalStorage<RlsStore>();

export function runWithClinicRls<T>(
  clinicId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const parent = rlsAls.getStore();
  const depth =
    parent && parent.kind === "clinic" ? Math.max(parent.depth, 0) : 0;
  return rlsAls.run({ kind: "clinic", clinicId, depth }, fn);
}

export function runWithRlsBypass<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return rlsAls.run({ kind: "bypass", depth: 0 }, fn);
}

/** Mark that SET LOCAL is already active on the current interactive tx. */
export function enterRlsTransaction<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const store = rlsAls.getStore();
  if (!store) return fn();
  return rlsAls.run({ ...store, depth: store.depth + 1 }, fn);
}
