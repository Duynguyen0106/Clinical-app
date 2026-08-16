"use client";

const TOKEN_KEY = "treow_token";
const CLINIC_KEY = "treow_clinic_id";

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, clinicId: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(CLINIC_KEY, clinicId);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CLINIC_KEY);
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
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const clinicId = getClinicId();
    if (clinicId) headers.set("X-Clinic-Id", clinicId);
  }

  const res = await fetch(`/api/v1${path}`, { ...init, headers });
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
