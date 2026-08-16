import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import { requireOwnerOrReception, requireStaff } from "@/server/rbac";
import {
  createRoom,
  createRoomSchema,
  listRooms,
} from "@/modules/scheduling/rooms";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  const rooms = await listRooms(ctx);
  return jsonOk({ rooms });
});

export const POST = withAuth(async (req, ctx) => {
  requireOwnerOrReception(ctx);
  const body = createRoomSchema.parse(await req.json());
  const room = await createRoom(ctx, body);
  return jsonCreated({ room });
});
