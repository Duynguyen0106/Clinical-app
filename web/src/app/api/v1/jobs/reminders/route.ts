import { withCronOrStaff } from "@/server/cron";
import { jsonOk } from "@/server/http";
import { sendUpcomingReminders } from "@/modules/notifications/appointments";

/** Cron (CRON_SECRET) or staff — reminder sweep. */
export const POST = withCronOrStaff(
  ["OWNER", "RECEPTION", "PRACTITIONER"],
  async () => {
    const result = await sendUpcomingReminders(48);
    return jsonOk(result);
  },
);
