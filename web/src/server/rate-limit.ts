/**
 * Fixed-window in-memory rate limiter.
 * Fine for single-instance / demo; use Redis (or edge) for multi-instance production.
 */

export type RateLimitOpts = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/** Test helper — clear all buckets. */
export function resetRateLimitStore() {
  store.clear();
}

function now() {
  return Date.now();
}

/** Prune expired buckets occasionally to avoid unbounded growth. */
function maybePrune(at: number) {
  if (store.size < 2_000) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= at) store.delete(key);
  }
}

/**
 * Consume one hit against `key`. Returns whether the request is allowed.
 */
export function consumeRateLimit(
  key: string,
  opts: RateLimitOpts,
): RateLimitResult {
  const at = now();
  maybePrune(at);

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= at) {
    bucket = { count: 0, resetAt: at + opts.windowMs };
    store.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, opts.limit - bucket.count);
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - at) / 1000));

  if (bucket.count > opts.limit) {
    return {
      ok: false,
      limit: opts.limit,
      remaining: 0,
      retryAfterSec,
      resetAt: bucket.resetAt,
    };
  }

  return {
    ok: true,
    limit: opts.limit,
    remaining,
    retryAfterSec,
    resetAt: bucket.resetAt,
  };
}
