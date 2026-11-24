import { NextResponse } from "next/server";
import { withPublic } from "@/server/api";
import { buildCalendarFeedIcs } from "@/modules/scheduling/calendar-feed";
import { enforceCalendarFeedLimits } from "@/server/abuse";

/**
 * Public ICS feed — phones subscribe with the secret token URL (no Bearer).
 * Path may be `/api/v1/calendar/feed/:token.ics` or `/api/v1/calendar/feed/:token`
 */
export const GET = withPublic(async (req, params) => {
  await enforceCalendarFeedLimits(req);
  const raw = params.token ?? "";
  const token = raw.replace(/\.ics$/i, "");
  const { body, etag, filename } = await buildCalendarFeedIcs(token);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
      "Referrer-Policy": "no-referrer",
      ETag: etag,
    },
  });
});
