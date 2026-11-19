import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { enforcePublicEmailPrefsLimits } from "@/server/abuse";
import {
  emailPrefsActionSchema,
  loadEmailPrefs,
  unsubscribeMarketing,
} from "@/modules/notifications/email-prefs";

export const GET = withPublic(async (req) => {
  await enforcePublicEmailPrefsLimits(req);
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) throw badRequest("token required");
  const prefs = await loadEmailPrefs(token);
  return jsonOk({ prefs });
});

export const POST = withPublic(async (req) => {
  await enforcePublicEmailPrefsLimits(req);
  const body = await req.json().catch(() => ({}));
  const parsed = emailPrefsActionSchema.parse(body);
  if (parsed.action === "unsubscribe_marketing") {
    const result = await unsubscribeMarketing(parsed.token);
    return jsonOk({ ok: true, ...result });
  }
  throw badRequest("Unsupported action");
});
