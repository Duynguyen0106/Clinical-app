import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** HttpOnly session cookie — primary browser auth (not readable by JS). */
export const SESSION_COOKIE = "treow_session";

const SESSION_DAYS = 30;

export function sessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function appendSessionCookie(
  res: NextResponse,
  rawToken: string,
  expiresAt?: Date,
) {
  const maxAge = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
    : SESSION_DAYS * 24 * 60 * 60;
  res.cookies.set(SESSION_COOKIE, rawToken, sessionCookieOptions(maxAge));
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
}

/** Bearer wins when present (scripts / native); otherwise HttpOnly cookie. */
export function rawSessionTokenFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const bearer = auth.slice("Bearer ".length).trim();
    if (bearer) return bearer;
  }

  if (
    typeof (request as NextRequest).cookies?.get === "function"
  ) {
    const fromNext = (request as NextRequest).cookies.get(SESSION_COOKIE)?.value;
    if (fromNext?.trim()) return fromNext.trim();
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      const v = rest.join("=").trim();
      return v || null;
    }
  }
  return null;
}
