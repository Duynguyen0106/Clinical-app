import { timingSafeEqual } from "node:crypto";

/** Bearer auth for ADMIN_PROVISION_SECRET (≥24 chars). */
export function isAdminProvisionAuthorized(req: Request): boolean {
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
