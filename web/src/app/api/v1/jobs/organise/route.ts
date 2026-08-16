import { withCronOrStaff } from "@/server/cron";
import { jsonOk } from "@/server/http";
import { processPendingOrganiseJobs } from "@/modules/visits/organise-job";

/** Drain pending AI organise jobs (cron or clinician/owner). */
export const POST = withCronOrStaff(
  ["OWNER", "PRACTITIONER"],
  async () => {
    const result = await processPendingOrganiseJobs(10);
    return jsonOk(result);
  },
);
