import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { z } from "zod";
import {
  exportNoteAudits,
  getClinicCompliance,
  updateClinicCompliance,
} from "@/modules/compliance/service";

export const GET = withAuth(async (req, ctx) => {
  const url = new URL(req.url);
  if (url.searchParams.get("audits") === "1") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const patientId = url.searchParams.get("patientId") ?? undefined;
    const events = await exportNoteAudits(ctx, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      patientId,
    });
    return jsonOk({
      exportedAt: new Date().toISOString(),
      clinicId: ctx.clinicId,
      count: events.length,
      events,
    });
  }

  const clinic = await getClinicCompliance(ctx);
  return jsonOk({ clinic });
});

const patchSchema = z.object({
  audioRetentionDays: z.number().int().min(0).max(365).optional(),
});

export const PATCH = withAuth(async (req, ctx) => {
  const body = patchSchema.parse(await req.json());
  const clinic = await updateClinicCompliance(ctx, body);
  return jsonOk({ clinic });
});
