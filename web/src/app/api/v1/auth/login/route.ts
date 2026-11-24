import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { login, loginSchema, logout } from "@/modules/auth/service";
import {
  enforceLoginLimits,
  recordFailedLoginAttempt,
} from "@/server/abuse";
import { AppError } from "@/server/errors";
import {
  appendSessionCookie,
  clearSessionCookie,
  rawSessionTokenFromRequest,
} from "@/server/session-cookie";

export const POST = withPublic(async (req) => {
  const body = loginSchema.parse(await req.json());
  await enforceLoginLimits(req, body.email);
  let result;
  try {
    result = await login(body);
  } catch (err) {
    // Only failed credentials burn the per-email budget (credential stuffing).
    // Successful staff / agent logins must not lock the account out.
    if (err instanceof AppError && err.status === 401) {
      await recordFailedLoginAttempt(body.email);
    }
    throw err;
  }
  // Cookie is the session capability — do not echo the raw token in JSON
  // (XSS / browser extensions would otherwise read it from the response body).
  const { accessToken, ...safe } = result;
  const res = jsonOk(safe);
  appendSessionCookie(
    res,
    accessToken,
    result.expiresAt instanceof Date
      ? result.expiresAt
      : new Date(result.expiresAt),
  );
  return res;
});

export const DELETE = withPublic(async (req) => {
  const raw = rawSessionTokenFromRequest(req);
  if (raw) {
    await logout(raw);
  }
  const res = jsonOk({ ok: true });
  clearSessionCookie(res);
  return res;
});
