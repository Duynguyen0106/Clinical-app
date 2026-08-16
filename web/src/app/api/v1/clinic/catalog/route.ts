import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  listAppointmentTypes,
  listPractitioners,
} from "@/modules/scheduling/service";
import { prisma } from "@/server/db";

export const GET = withAuth(async (_req, ctx) => {
  const [appointmentTypes, practitioners, locations] = await Promise.all([
    listAppointmentTypes(ctx),
    listPractitioners(ctx),
    prisma.location.findMany({
      where: { clinicId: ctx.clinicId, active: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return jsonOk({ appointmentTypes, practitioners, locations });
});
