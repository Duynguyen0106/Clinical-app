import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  createPatient,
  createPatientSchema,
  listPatients,
  parseListQuery,
  todayYmd,
} from "@/modules/patients/service";
import { requireStaff } from "@/server/rbac";

export const GET = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const parsed = parseListQuery(new URL(req.url));
  let { q, take, appointmentOn, practitionerId } = parsed;

  // Practitioners: default to today's diary; with a search query, search own
  // diary history (any day) instead of forcing today.
  if (ctx.role === "PRACTITIONER") {
    practitionerId = ctx.practitionerProfileId ?? practitionerId;
    if (!q?.trim()) {
      const { prisma } = await import("@/server/db");
      const clinic = await prisma.clinic.findUniqueOrThrow({
        where: { id: ctx.clinicId },
        select: { timezone: true },
      });
      appointmentOn = appointmentOn ?? todayYmd(clinic.timezone);
    }
  }

  const patients = await listPatients(ctx, {
    q,
    take,
    appointmentOn,
    practitionerId,
  });
  return jsonOk({ patients });
});

export const POST = withAuth(async (req, ctx) => {
  requireStaff(ctx);
  const body = createPatientSchema.parse(await req.json());
  const patient = await createPatient(ctx, body);
  return jsonCreated({ patient });
});
