import { after } from "next/server";
import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireClinician } from "@/server/rbac";
import {
  startRecording,
  stopRecordingAndOrganise,
  stopRecordingSchema,
} from "@/modules/visits/service";
import {
  enqueueOrganiseJob,
  organiseAsyncEnabled,
  processOrganiseJob,
} from "@/modules/visits/organise-job";

export const POST = withAuth(async (_req, ctx, params) => {
  requireClinician(ctx);
  const recording = await startRecording(ctx, params.id);
  return jsonOk({ recording });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  requireClinician(ctx);
  const body = stopRecordingSchema.parse(await req.json().catch(() => ({})));

  if (!organiseAsyncEnabled()) {
    const result = await stopRecordingAndOrganise(ctx, params.id, body);
    return jsonOk({ async: false, ...result });
  }

  const job = await enqueueOrganiseJob(ctx, params.id, body);
  after(() => {
    void processOrganiseJob(job.id);
  });

  return jsonOk({
    async: true,
    job: { id: job.id, status: job.status, visitId: job.visitId },
  });
});
