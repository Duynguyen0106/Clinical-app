import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireOwnerOrReception } from "@/server/rbac";
import { updateRoom, updateRoomSchema } from "@/modules/scheduling/rooms";

export const PATCH = withAuth(async (req, ctx, params) => {
  requireOwnerOrReception(ctx);
  const body = updateRoomSchema.parse(await req.json());
  const room = await updateRoom(ctx, params.id, body);
  return jsonOk({ room });
});
