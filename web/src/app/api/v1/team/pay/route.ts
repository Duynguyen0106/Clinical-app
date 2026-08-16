import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { listStaffPaySummary, staffPayCsv } from "@/modules/team/pay";

export const GET = withAuth(async (req, ctx) => {
  const month =
    req.nextUrl.searchParams.get("month") ??
    new Date().toISOString().slice(0, 7);
  const format = req.nextUrl.searchParams.get("format");
  const summary = await listStaffPaySummary(ctx, month);

  if (format === "csv") {
    return new Response(staffPayCsv(summary), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="staff-pay-${month}.csv"`,
      },
    });
  }

  return jsonOk(summary);
});
