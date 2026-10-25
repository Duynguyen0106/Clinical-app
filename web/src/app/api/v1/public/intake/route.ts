import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { clientIp } from "@/server/client-ip";
import { enforcePublicIntakeLimits } from "@/server/abuse";
import {
  completePublicIntake,
  loadPublicIntake,
  savePublicDraft,
} from "@/modules/intake/service";
import { intakeCompleteSchema, intakeDraftSchema } from "@/modules/intake/schema";

export const GET = withPublic(async (req) => {
  await enforcePublicIntakeLimits(req);
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) throw badRequest("token required");
  const form = await loadPublicIntake(token);
  return jsonOk({ form });
});

export const POST = withPublic(async (req) => {
  await enforcePublicIntakeLimits(req);
  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;

  if (action === "draft") {
    const parsed = intakeDraftSchema.parse(body);
    await savePublicDraft(parsed.token, parsed.answers);
    return jsonOk({ ok: true });
  }

  if (action === "complete") {
    const parsed = intakeCompleteSchema.parse(body);
    const result = await completePublicIntake({
      token: parsed.token,
      answers: parsed.answers,
      privacyConsent: parsed.privacyConsent,
      treatmentConsent: parsed.treatmentConsent,
      marketingConsent: parsed.marketingConsent,
      signatureName: parsed.signatureName,
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(req),
    });
    return jsonOk({ ok: true, ...result });
  }

  throw badRequest("action must be draft or complete");
});
