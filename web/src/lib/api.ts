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
  ) {
    super(message);
  }
}

export async function api<T>(
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
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.message ?? res.statusText,
      data?.error?.code,
    );
  }

  return data as T;
}
