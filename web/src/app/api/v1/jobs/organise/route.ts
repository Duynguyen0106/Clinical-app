import { withCronOrStaff } from "@/server/cron";
import { jsonOk } from "@/server/http";
import { processPendingOrganiseJobs } from "@/modules/visits/organise-job";

/**
 * Cron drains all clinics; staff may only drain their own clinic's jobs.
 * Vercel Cron invokes GET; staff Settings uses POST.
 */
async function handle(
  _req: Request,
  ctx: { mode: "cron" } | { mode: "staff"; auth: { clinicId: string } },
) {
  const clinicId = ctx.mode === "staff" ? ctx.auth.clinicId : undefined;
  const result = await processPendingOrganiseJobs(10, { clinicId });
  return jsonOk(result);
}

export const GET = withCronOrStaff(["OWNER", "PRACTITIONER"], handle);
export const POST = withCronOrStaff(["OWNER", "PRACTITIONER"], handle);
