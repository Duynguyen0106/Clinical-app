import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  forgotPasswordSchema,
  requestPasswordReset,
} from "@/modules/auth/password-reset";

export const POST = withPublic(async (req) => {
  const body = forgotPasswordSchema.parse(await req.json());
  const result = await requestPasswordReset(body);
  return jsonOk(result);
});
