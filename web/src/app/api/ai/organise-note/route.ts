import { NextRequest, NextResponse } from "next/server";
import { mockOrganiseNote, mockTranscribe } from "@/modules/ai/mock-pipeline";
import { resolveAuth } from "@/server/auth";
import { requireClinician } from "@/server/rbac";
import { jsonError } from "@/server/http";

/** Demo organise endpoint — clinician auth required (no PHI in mock path). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveAuth(req);
    requireClinician(ctx);

    const body = (await req.json()) as {
      appointmentId?: string;
      patientName?: string;
      appointmentType?: string;
    };

    const patientName = body.patientName ?? "Patient";
    const appointmentType = body.appointmentType ?? "Consultation";

    const transcript = await mockTranscribe(
      `demo://${body.appointmentId ?? "apt"}`,
    );
    const note = await mockOrganiseNote({
      transcript,
      patientName,
      appointmentType,
    });

    return NextResponse.json({
      note,
      transcriptPreview: transcript.slice(0, 280) + "…",
    });
  } catch (err) {
    return jsonError(err);
  }
}
