import { z } from "zod";
import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { unauthorized, badRequest } from "@/server/errors";
import { isAdminProvisionAuthorized } from "@/server/admin-auth";
import {
  getEffectiveEmailProvider,
  loadEmailRuntimeConfig,
  saveEmailRuntimeConfig,
} from "@/modules/notifications/email-config";

const bodySchema = z.object({
  apiKey: z.string().min(10).max(200).optional(),
  from: z.string().min(3).max(200).optional(),
  provider: z.enum(["resend", "console"]).optional(),
});

export const GET = withPublic(async (req) => {
  if (!isAdminProvisionAuthorized(req)) {
    throw unauthorized("Invalid provision secret");
  }
  const cfg = await loadEmailRuntimeConfig({ bypassCache: true });
  const provider = await getEffectiveEmailProvider();
  return jsonOk({
    provider,
    hasApiKey: Boolean(cfg.apiKey),
    from: cfg.from,
  });
});

export const PUT = withPublic(async (req) => {
  if (!isAdminProvisionAuthorized(req)) {
    throw unauthorized("Invalid provision secret");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Invalid JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
  }
  if (!parsed.data.apiKey && !parsed.data.from && !parsed.data.provider) {
    throw badRequest("Provide apiKey, from, and/or provider");
  }
  const cfg = await saveEmailRuntimeConfig(parsed.data);
  return jsonOk({
    provider: cfg.provider,
    hasApiKey: Boolean(cfg.apiKey),
    from: cfg.from,
  });
});
