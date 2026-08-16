import { withAuth } from "@/server/api";
import { jsonCreated } from "@/server/http";
import { startVisit } from "@/modules/visits/service";
import { z } from "zod";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
});

export const POST = withAuth(async (req, ctx) => {
  const { appointmentId } = bodySchema.parse(await req.json());
  const visit = await startVisit(ctx, appointmentId);
  return jsonCreated({ visit });
});
