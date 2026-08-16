import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { uploadRecordingAudio } from "@/modules/visits/service";

export const POST = withAuth(async (req, ctx, params) => {
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) {
    throw badRequest("audio file required");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) throw badRequest("Empty audio");

  const recording = await uploadRecordingAudio(ctx, params.id, bytes);
  return jsonOk({ recording });
});
