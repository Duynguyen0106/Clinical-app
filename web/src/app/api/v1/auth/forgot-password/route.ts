import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  forgotPasswordSchema,
  requestPasswordReset,
} from "@/modules/auth/password-reset";
import { enforceForgotPasswordLimits } from "@/server/abuse";
import { clientIp } from "@/server/client-ip";
import { assertTurnstileToken } from "@/server/turnstile";

export const POST = withPublic(async (req) => {
  const body = forgotPasswordSchema.parse(await req.json());
  enforceForgotPasswordLimits(req, body.email);
  await assertTurnstileToken(body.captchaToken, { ip: clientIp(req) });
  const result = await requestPasswordReset(body);
  return jsonOk(result);
});
