import { withCronOrStaff } from "@/server/cron";
import { jsonOk } from "@/server/http";
import { sendDuePatientEmails } from "@/modules/notifications/patient-emails";

/**
 * Cron (CRON_SECRET) sweeps all clinics; staff may only sweep their own clinic.
 * Sends thank-you, review request, no-show follow-up, optional same-day reminder.
 * Vercel Cron / external scheduler should call hourly alongside reminders.
 */
async function handle(
  _req: Request,
  ctx: { mode: "cron" } | { mode: "staff"; auth: { clinicId: string } },
) {
  const clinicId = ctx.mode === "staff" ? ctx.auth.clinicId : undefined;
  const result = await sendDuePatientEmails({ clinicId });
  return jsonOk(result);
}

export const GET = withCronOrStaff(["OWNER", "RECEPTION"], handle);
export const POST = withCronOrStaff(["OWNER", "RECEPTION"], handle);
