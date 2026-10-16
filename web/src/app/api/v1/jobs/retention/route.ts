import { withCronOrStaff } from "@/server/cron";
import { jsonOk } from "@/server/http";
import { runAudioRetention } from "@/modules/compliance/retention";

/** Cron runs all clinics; staff owner runs their clinic only. */
async function handle(
  _req: Request,
  ctx: { mode: "cron" } | { mode: "staff"; auth: { clinicId: string } },
) {
  const clinicId = ctx.mode === "staff" ? ctx.auth.clinicId : undefined;
  const result = await runAudioRetention(clinicId);
  return jsonOk(result);
}

export const GET = withCronOrStaff(["OWNER"], handle);
export const POST = withCronOrStaff(["OWNER"], handle);
