import { z } from "zod";
import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { listPatientMatches } from "@/modules/patients/service";
import { requireStaff } from "@/server/rbac";

const querySchema = z.object({
  email: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().email().optional(),
  ),
  phone: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().max(40).optional(),
  ),
});

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const url = new URL(req.url);
  const parsed = querySchema.parse({
    email: url.searchParams.get("email") ?? undefined,
    phone: url.searchParams.get("phone") ?? undefined,
  });
  const matches = await listPatientMatches(ctx, {
    email: parsed.email ?? null,
    phone: parsed.phone ?? null,
  });
  return jsonOk({ matches });
});
