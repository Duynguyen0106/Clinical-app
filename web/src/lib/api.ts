"use client";

const TOKEN_KEY = "treow_token";
const CLINIC_KEY = "treow_clinic_id";
const HINT_KEY = "treow_session_hint";

/** Legacy localStorage token — only used for sessions created before cookie auth. */
export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function hasSessionHint() {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(HINT_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return Boolean(getClinicId() || getToken());
}

/**
 * Persist clinic selection. Session capability lives in the HttpOnly cookie
 * set by /auth/login — we deliberately do not store access tokens in
 * localStorage (XSS would otherwise steal them).
 */
export function setSession(clinicId: string, _legacyToken?: string) {
  localStorage.setItem(CLINIC_KEY, clinicId);
  try {
    sessionStorage.setItem(HINT_KEY, "1");
  } catch {
    /* ignore */
  }
  // Drop any pre-cookie token so XSS cannot read a Bearer secret.
  localStorage.removeItem(TOKEN_KEY);
  void _legacyToken;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CLINIC_KEY);
  try {
    sessionStorage.removeItem(HINT_KEY);
  } catch {
    /* ignore */
  }
}

export function getClinicId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CLINIC_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run async jobs with a small concurrency cap so Cloudflare Workers + Neon
 * WebSocket (`maxUses: 1`) are not saturated on desk/calendar boot.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean; retries?: number } = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const idempotent = method === "GET" || method === "HEAD";
  const attempts = init.retries ?? (idempotent ? 3 : 1);

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await apiOnce<T>(path, init);
    } catch (err) {
      lastErr = err;
      const retryable =
        err instanceof ApiError && isTransientHttpStatus(err.status);
      if (!retryable || attempt === attempts - 1) throw err;
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

async function apiOnce<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (init.auth !== false) {
    // Prefer cookie (credentials). Send legacy Bearer only if still present.
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const clinicId = getClinicId();
    if (clinicId) headers.set("X-Clinic-Id", clinicId);
  }

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin",
  });
  const raw = await res.text();
  let data: {
    error?: { message?: string; code?: string; details?: unknown };
  } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const cfEdge =
      /error code:\s*11\d{2}/i.test(raw) ||
      /worker threw an exception/i.test(raw);
    const fallback =
      res.status >= 500
        ? cfEdge || res.status === 502 || res.status === 503 || res.status === 504
          ? "Server overloaded — wait a moment and try again"
          : "Server temporarily unavailable — try again"
        : res.statusText;
    throw new ApiError(
      res.status,
      data?.error?.message || fallback,
      data?.error?.code,
      data?.error?.details,
    );
  }

  return data as T;
}
