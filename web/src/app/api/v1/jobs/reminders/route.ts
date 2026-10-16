import { withCronOrStaff } from "@/server/cron";
import { jsonOk } from "@/server/http";
import { sendUpcomingReminders } from "@/modules/notifications/appointments";

/**
 * Cron (CRON_SECRET) sweeps all clinics; staff may only sweep their own clinic.
 * Vercel Cron invokes GET; staff Settings uses POST.
 */
async function handle(
  _req: Request,
  ctx: { mode: "cron" } | { mode: "staff"; auth: { clinicId: string } },
) {
  const clinicId = ctx.mode === "staff" ? ctx.auth.clinicId : undefined;
  const result = await sendUpcomingReminders(48, { clinicId });
  return jsonOk(result);
}

export const GET = withCronOrStaff(["OWNER", "RECEPTION"], handle);
export const POST = withCronOrStaff(["OWNER", "RECEPTION"], handle);
