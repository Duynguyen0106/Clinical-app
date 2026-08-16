import { withPublic } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  getPublicClinicBySlug,
  publicBook,
  publicBookSchema,
} from "@/modules/scheduling/service";
import { manageUrl } from "@/modules/scheduling/manage";
import {
  enforcePublicBookLimits,
  enforcePublicClinicGetLimits,
} from "@/server/abuse";
import { clientIp } from "@/server/client-ip";
import { assertTurnstileToken } from "@/server/turnstile";

export const GET = withPublic(async (req, params) => {
  enforcePublicClinicGetLimits(req);
  const clinic = await getPublicClinicBySlug(params.slug);
  return jsonOk({ clinic });
});

export const POST = withPublic(async (req, params) => {
  const body = publicBookSchema.parse(await req.json());
  enforcePublicBookLimits(req, body.patient.email);
  await assertTurnstileToken(body.captchaToken, { ip: clientIp(req) });
  const result = await publicBook(params.slug, body);
  const appointment = result.appointment;
  return jsonCreated({
    appointment,
    manageUrl: manageUrl(appointment.id),
    deposit: result.deposit,
    policyText: result.policyText,
  });
});
