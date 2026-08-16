import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  resetPasswordSchema,
  resetPasswordWithToken,
} from "@/modules/auth/password-reset";
import { enforceResetPasswordLimits } from "@/server/abuse";

export const POST = withPublic(async (req) => {
  const body = resetPasswordSchema.parse(await req.json());
  enforceResetPasswordLimits(req);
  const result = await resetPasswordWithToken(body);
  return jsonOk(result);
});
