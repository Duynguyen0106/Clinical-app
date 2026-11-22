import { NextRequest } from "next/server";
import type { AuthContext } from "./auth";
import { resolveAuth } from "./auth";
import { withClinicRequest } from "./clinic-rls";
import { jsonError } from "./http";

type Handler = (
  req: NextRequest,
  ctx: AuthContext,
  params: Record<string, string>,
) => Promise<Response>;

type PublicHandler = (
  req: NextRequest,
  params: Record<string, string>,
) => Promise<Response>;

export function withAuth(handler: Handler) {
  return async (
    req: NextRequest,
    route?: { params: Promise<Record<string, string>> },
  ) => {
    try {
      const params = route?.params ? await route.params : {};
      const auth = await resolveAuth(req);
      // One interactive tx + SET LOCAL for the whole handler (treow_app + FORCE).
      return await withClinicRequest(auth.clinicId, () =>
        handler(req, auth, params),
      );
    } catch (error) {
      return jsonError(error);
    }
  };
}

export function withPublic(handler: PublicHandler) {
  return async (
    req: NextRequest,
    route?: { params: Promise<Record<string, string>> },
  ) => {
    try {
      const params = route?.params ? await route.params : {};
      return await handler(req, params);
    } catch (error) {
      return jsonError(error);
    }
  };
}
