import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { login, loginSchema, logout } from "@/modules/auth/service";
import { enforceLoginLimits } from "@/server/abuse";

export const POST = withPublic(async (req) => {
  const body = loginSchema.parse(await req.json());
  enforceLoginLimits(req, body.email);
  const result = await login(body);
  return jsonOk(result);
});

export const DELETE = withPublic(async (req) => {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    await logout(auth.slice("Bearer ".length).trim());
  }
  return jsonOk({ ok: true });
});
