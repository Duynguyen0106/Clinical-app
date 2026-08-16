import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import {
  getPatient,
  getPatientPrep,
  recordNoteHistoryExpand,
  updatePatient,
  updatePatientSchema,
} from "@/modules/patients/service";
import { z } from "zod";

export const GET = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const url = new URL(req.url);
  if (url.searchParams.get("prep") === "1") {
    const prep = await getPatientPrep(ctx, params.id, {
      source: url.searchParams.get("source") ?? "unknown",
    });
    return jsonOk({ prep });
  }
  const patient = await getPatient(ctx, params.id);
  return jsonOk({ patient });
});

export const PATCH = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = updatePatientSchema.parse(await req.json());
  const patient = await updatePatient(ctx, params.id, body);
  return jsonOk({ patient });
});

const expandSchema = z.object({
  action: z.literal("note_expanded"),
  noteId: z.string().min(1),
  source: z.string().max(80).optional(),
});

/** Audit: practitioner expanded a prior note in prep / history UI */
export const POST = withAuth(async (req, ctx, params) => {
  requireStaff(ctx);
  const body = expandSchema.parse(await req.json());
  const result = await recordNoteHistoryExpand(ctx, params.id, body.noteId, {
    source: body.source,
  });
  return jsonOk(result);
});
