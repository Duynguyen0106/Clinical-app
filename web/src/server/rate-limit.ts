/**
 * Fixed-window rate limiter.
 * In-memory by default (single instance). When UPSTASH_REDIS_REST_URL +
 * UPSTASH_REDIS_REST_TOKEN are set, uses Upstash REST for multi-instance.
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

function consumeMemory(key: string, opts: RateLimitOpts): RateLimitResult {
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

function upstashConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

async function consumeUpstash(
  key: string,
  opts: RateLimitOpts,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000));
  const redisKey = `rl:${key}`;

  // INCR then EXPIRE on first hit (pipeline)
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, windowSec, "NX"],
      ["PTTL", redisKey],
    ]),
  });

  if (!res.ok) {
    console.error("Upstash rate limit failed", res.status);
    return failClosedResult(key, opts);
  }

  const rows = (await res.json()) as { result: number }[];
  const count = Number(rows[0]?.result ?? 0);
  const pttl = Number(rows[2]?.result ?? opts.windowMs);
  const resetAt = now() + (pttl > 0 ? pttl : opts.windowMs);
  const remaining = Math.max(0, opts.limit - count);
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - now()) / 1000));

  if (count > opts.limit) {
    return {
      ok: false,
      limit: opts.limit,
      remaining: 0,
      retryAfterSec,
      resetAt,
    };
  }

  return {
    ok: true,
    limit: opts.limit,
    remaining,
    retryAfterSec,
    resetAt,
  };
}

/**
 * Consume one hit against `key`. Returns whether the request is allowed.
 * Sync for in-memory; when Upstash is configured callers should use
 * `consumeRateLimitAsync`. Sync path still works (memory) for unit tests.
 */
export function consumeRateLimit(
  key: string,
  opts: RateLimitOpts,
): RateLimitResult {
  return consumeMemory(key, opts);
}

function failClosedResult(key: string, opts: RateLimitOpts): RateLimitResult {
  // When Upstash is configured it is the source of truth — do not fall back to
  // per-instance memory (that multiplies quotas under Redis outages).
  // Escape hatch: RATE_LIMIT_FAIL_OPEN=1
  if (process.env.RATE_LIMIT_FAIL_OPEN?.trim() === "1") {
    return consumeMemory(key, opts);
  }
  const at = now();
  return {
    ok: false,
    limit: opts.limit,
    remaining: 0,
    retryAfterSec: 30,
    resetAt: at + 30_000,
  };
}

export async function consumeRateLimitAsync(
  key: string,
  opts: RateLimitOpts,
): Promise<RateLimitResult> {
  if (upstashConfigured()) {
    try {
      return await consumeUpstash(key, opts);
    } catch (err) {
      console.error("Upstash rate limit error", err);
      return failClosedResult(key, opts);
    }
  }
  return consumeMemory(key, opts);
}

export function rateLimitBackend(): "memory" | "upstash" {
  return upstashConfigured() ? "upstash" : "memory";
}
