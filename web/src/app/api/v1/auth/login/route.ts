import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { login, loginSchema, logout } from "@/modules/auth/service";

export const POST = withPublic(async (req) => {
  const body = loginSchema.parse(await req.json());
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
