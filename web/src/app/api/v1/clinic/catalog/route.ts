import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  listAppointmentTypes,
  listPractitioners,
} from "@/modules/scheduling/service";
import { listRooms } from "@/modules/scheduling/rooms";
import { prisma } from "@/server/db";

export const GET = withAuth(async (_req, ctx) => {
  const [appointmentTypes, practitioners, locations, rooms] = await Promise.all([
    listAppointmentTypes(ctx),
    listPractitioners(ctx),
    prisma.location.findMany({
      where: { clinicId: ctx.clinicId, active: true },
      orderBy: { name: "asc" },
    }),
    listRooms(ctx, { activeOnly: true }),
  ]);
  return jsonOk({ appointmentTypes, practitioners, locations, rooms });
});
