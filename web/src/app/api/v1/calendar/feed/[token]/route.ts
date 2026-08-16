import { NextResponse } from "next/server";
import { withPublic } from "@/server/api";
import { buildCalendarFeedIcs } from "@/modules/scheduling/calendar-feed";

/**
 * Public ICS feed — phones subscribe with the secret token URL (no Bearer).
 * Path may be `/api/v1/calendar/feed/:token.ics` or `/api/v1/calendar/feed/:token`
 */
export const GET = withPublic(async (_req, params) => {
  const raw = params.token ?? "";
  const token = raw.replace(/\.ics$/i, "");
  const { body, etag, filename } = await buildCalendarFeedIcs(token);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
      ETag: etag,
    },
  });
});
