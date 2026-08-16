import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import {
  getMyCalendarFeed,
  rotateMyCalendarFeed,
} from "@/modules/scheduling/calendar-feed";

function requestOrigin(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

/** GET — current practitioner phone-calendar subscribe URLs */
export const GET = withAuth(async (req, ctx) => {
  const feed = await getMyCalendarFeed(ctx, { origin: requestOrigin(req) });
  return jsonOk({ feed });
});

/** POST — rotate feed token (invalidates old phone subscriptions) */
export const POST = withAuth(async (req, ctx) => {
  const feed = await rotateMyCalendarFeed(ctx, { origin: requestOrigin(req) });
  return jsonOk({ feed });
});
