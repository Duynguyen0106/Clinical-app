import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireRole } from "@/server/auth";
import { sendUpcomingReminders } from "@/modules/notifications/appointments";

/** Staff-triggered reminder sweep (cron can hit this later). */
export const POST = withAuth(async (_req, ctx) => {
  requireRole(ctx, ["OWNER", "RECEPTION", "PRACTITIONER"]);
  const result = await sendUpcomingReminders(48);
  return jsonOk(result);
});
