import { timingSafeEqual } from "node:crypto";
import { withPublic } from "@/server/api";
import { jsonOk } from "@/server/http";
import { unauthorized, badRequest } from "@/server/errors";
import {
  parseProvisionBody,
  provisionClinic,
} from "@/modules/clinic/provision";
import { getAppBaseUrl } from "@/server/env";
import { getWebsiteSnippets } from "@/modules/clinic/website";

function isProvisionAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_PROVISION_SECRET?.trim() || "";
  if (!secret || secret.length < 24) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  if (token.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

export const POST = withPublic(async (req) => {
  if (!isProvisionAuthorized(req)) {
    throw unauthorized("Invalid provision secret");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Invalid JSON");
  }
  const input = parseProvisionBody(body);
  const result = await provisionClinic(input);
  const snippets = getWebsiteSnippets({
    appBaseUrl: getAppBaseUrl(),
    slug: result.clinic.slug,
    clinicName: result.clinic.name,
  });
  return jsonOk({
    clinic: {
      id: result.clinic.id,
      name: result.clinic.name,
      slug: result.clinic.slug,
      saasPlan: result.clinic.saasPlan,
      saasStatus: result.clinic.saasStatus,
      saasTrialEndsAt: result.clinic.saasTrialEndsAt,
    },
    owner: {
      email: result.ownerEmail,
      name: result.ownerName,
    },
    urls: {
      login: snippets.loginUrl,
      book: snippets.bookUrl,
      embed: snippets.embedUrl,
    },
    website: {
      buttonHtml: snippets.buttonHtml,
      iframeHtml: snippets.iframeHtml,
    },
  });
});
