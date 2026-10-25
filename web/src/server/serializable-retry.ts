/**
 * Retry Prisma Serializable transaction conflicts (P2034).
 * Walks a shallow cause chain so wrapped errors still match.
 */
export async function withSerializableRetry<T>(
  run: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await run();
    } catch (err) {
      last = err;
      if (!isPrismaSerializationFailure(err) || i === attempts - 1) throw err;
      // Brief backoff reduces stampeding retries under contention
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  throw last;
}

function isPrismaSerializationFailure(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur; depth += 1) {
    if (cur && typeof cur === "object" && "code" in cur) {
      if (String((cur as { code?: unknown }).code) === "P2034") return true;
    }
    cur =
      cur && typeof cur === "object" && "cause" in cur
        ? (cur as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}
