import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  resetPasswordSchema,
  resetPasswordWithToken,
} from "@/modules/auth/password-reset";

export const POST = withPublic(async (req) => {
  const body = resetPasswordSchema.parse(await req.json());
  const result = await resetPasswordWithToken(body);
  return jsonOk(result);
});
