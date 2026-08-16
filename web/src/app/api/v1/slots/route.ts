import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { requireStaff } from "@/server/rbac";
import { listClinicSlots } from "@/modules/scheduling/slots";

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const url = new URL(req.url);
  const appointmentTypeId = url.searchParams.get("appointmentTypeId");
  const practitionerId = url.searchParams.get("practitionerId");
  if (!appointmentTypeId || !practitionerId) {
    throw badRequest("appointmentTypeId and practitionerId required");
  }
  const days = Number(url.searchParams.get("days") ?? "14");
  const durationRaw = url.searchParams.get("durationMinutes");
  const durationMinutes = durationRaw ? Number(durationRaw) : undefined;
  const fromRaw = url.searchParams.get("from");

  const slots = await listClinicSlots({
    clinicId: ctx.clinicId,
    appointmentTypeId,
    practitionerId,
    days: Number.isFinite(days) ? days : 14,
    from: fromRaw ? new Date(fromRaw) : undefined,
    durationMinutes:
      durationMinutes && Number.isFinite(durationMinutes)
        ? durationMinutes
        : undefined,
    limit: 64,
  });
  return jsonOk({ slots });
});
