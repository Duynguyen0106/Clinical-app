import { NextRequest, NextResponse } from "next/server";
import { mockOrganiseNote, mockTranscribe } from "@/modules/ai/mock-pipeline";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    appointmentId?: string;
    patientName?: string;
    appointmentType?: string;
  };

  const patientName = body.patientName ?? "Patient";
  const appointmentType = body.appointmentType ?? "Consultation";

  const transcript = await mockTranscribe(`demo://${body.appointmentId ?? "apt"}`);
  const note = await mockOrganiseNote({
    transcript,
    patientName,
    appointmentType,
  });

  return NextResponse.json({
    note,
    transcriptPreview: transcript.slice(0, 280) + "…",
  });
}
