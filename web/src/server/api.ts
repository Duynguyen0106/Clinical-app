import { NextRequest } from "next/server";
import type { AuthContext } from "./auth";
import { resolveAuth } from "./auth";
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
      return await handler(req, auth, params);
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
