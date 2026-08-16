import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { badRequest } from "@/server/errors";
import { uploadRecordingAudio } from "@/modules/visits/service";
import { requireClinician } from "@/server/rbac";

export const POST = withAuth(async (req, ctx, params) => {
  requireClinician(ctx);
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) {
    throw badRequest("audio file required");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) throw badRequest("Empty audio");

  const name = typeof file.name === "string" ? file.name : "visit.webm";
  const extension =
    name.includes(".") && name.split(".").pop()
      ? name.split(".").pop()!.toLowerCase()
      : file.type.includes("mp4")
        ? "mp4"
        : file.type.includes("aac")
          ? "aac"
          : "webm";

  const recording = await uploadRecordingAudio(ctx, params.id, bytes, {
    extension,
  });
  return jsonOk({ recording });
});
