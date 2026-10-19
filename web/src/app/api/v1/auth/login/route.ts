import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { login, loginSchema, logout } from "@/modules/auth/service";
import { enforceLoginLimits } from "@/server/abuse";
import {
  appendSessionCookie,
  clearSessionCookie,
  rawSessionTokenFromRequest,
} from "@/server/session-cookie";

export const POST = withPublic(async (req) => {
  const body = loginSchema.parse(await req.json());
  await enforceLoginLimits(req, body.email);
  const result = await login(body);
  const res = jsonOk(result);
  appendSessionCookie(
    res,
    result.accessToken,
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
