import { withAuth } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  startRecording,
  stopRecordingAndOrganise,
  stopRecordingSchema,
} from "@/modules/visits/service";

export const POST = withAuth(async (_req, ctx, params) => {
  const recording = await startRecording(ctx, params.id);
  return jsonCreated({ recording });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  const body = stopRecordingSchema.parse(await req.json().catch(() => ({})));
  const result = await stopRecordingAndOrganise(ctx, params.id, body);
  return jsonOk(result);
});
