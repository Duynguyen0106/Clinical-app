import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  createAppointment,
  createAppointmentSchema,
  listAppointments,
} from "@/modules/scheduling/service";

export const GET = withAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const appointments = await listAppointments(ctx, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    practitionerId: url.searchParams.get("practitionerId") ?? undefined,
  });
  return jsonOk({ appointments });
});

export const POST = withAuth(async (req, ctx) => {
  const body = createAppointmentSchema.parse(await req.json());
  const appointment = await createAppointment(ctx, body);
  return jsonCreated({ appointment });
});
