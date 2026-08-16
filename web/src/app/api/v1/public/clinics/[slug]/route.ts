import { withPublic } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  getPublicClinicBySlug,
  publicBook,
  publicBookSchema,
} from "@/modules/scheduling/service";
import { manageUrl } from "@/modules/scheduling/manage";

export const GET = withPublic(async (_req, params) => {
  const clinic = await getPublicClinicBySlug(params.slug);
  return jsonOk({ clinic });
});

export const POST = withPublic(async (req, params) => {
  const body = publicBookSchema.parse(await req.json());
  const appointment = await publicBook(params.slug, body);
  return jsonCreated({
    appointment,
    manageUrl: manageUrl(appointment.id),
  });
});
