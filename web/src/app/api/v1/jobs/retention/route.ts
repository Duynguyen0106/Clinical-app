import { withCronOrStaff } from "@/server/cron";
import { jsonOk } from "@/server/http";
import { runAudioRetention } from "@/modules/compliance/retention";

/** Cron runs all clinics; staff owner runs their clinic only. */
export const POST = withCronOrStaff(["OWNER"], async (_req, ctx) => {
  const clinicId = ctx.mode === "staff" ? ctx.auth.clinicId : undefined;
  const result = await runAudioRetention(clinicId);
  return jsonOk(result);
});
