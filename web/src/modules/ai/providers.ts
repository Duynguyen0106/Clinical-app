/**
 * AI provider adapters — select via AI_PROVIDER=mock|openai
 * STT: mock (demo transcript) or whisper-compatible endpoint later.
 */

import type { NoteSection } from "@/modules/notes/templates";
import {
  mockOrganiseNote,
  mockTranscribe,
  type OrganiseNoteInput,
} from "./mock-pipeline";
import { mapSoapToTemplateSections } from "./map-to-template";

export type NoteContent = Record<string, string | string[]> & {
  clinician_review_flags: string[];
};

export type OrganiseWithTemplateInput = OrganiseNoteInput & {
  sections: NoteSection[];
  /** Template display name for discipline-aware prompting */
  templateName?: string;
};

function provider() {
  return (process.env.AI_PROVIDER ?? "mock").toLowerCase();
}

export async function transcribeAudio(args: {
  storageKey: string;
  audioBytes?: Buffer;
}): Promise<string> {
  const mode = provider();
  if (mode === "openai" && process.env.OPENAI_API_KEY && args.audioBytes) {
    return whisperTranscribe(args.audioBytes);
  }
  return mockTranscribe(args.storageKey);
}

export async function organiseNote(
  input: OrganiseWithTemplateInput,
): Promise<NoteContent> {
  const mode = provider();
  if (mode === "openai" && process.env.OPENAI_API_KEY) {
    return openaiOrganise(input);
  }
  return mockOrganiseWithTemplate(input);
}

async function mockOrganiseWithTemplate(
  input: OrganiseWithTemplateInput,
): Promise<NoteContent> {
  const soap = await mockOrganiseNote(input);
  return mapSoapToTemplateSections(soap, input.sections);
}

async function whisperTranscribe(audioBytes: Buffer): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audioBytes)], { type: "audio/webm" }),
    "audio.webm",
  );
  form.append("model", "whisper-1");
  form.append("language", "en");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { text: string };
  return data.text;
}

async function openaiOrganise(
  input: OrganiseWithTemplateInput,
): Promise<NoteContent> {
  const sectionIds = input.sections.map((s) => s.id);
  const schemaHint = input.sections
    .map((s) => `- ${s.id} (${s.title}): ${s.hint ?? "clinical prose"}`)
    .join("\n");
  const templateLine = input.templateName
    ? `Clinic template: ${input.templateName}.`
    : "Clinic template: MSK allied-health note.";
  const prior = input.priorContext?.trim()
    ? `\nPrior signed-note context (do not copy blindly):\n${input.priorContext.trim()}\n`
    : "";

  const system = `You are a UK allied-health clinical scribe for physiotherapy, osteopathy, and manual therapy.
${templateLine}
Return ONLY valid JSON with keys: ${sectionIds.join(", ")}, clinician_review_flags (string array).
Write each section in the clinical voice matching that section title (e.g. osteopathy “Presentation/Findings/Treatment”, physio SOAP, manual therapy Techniques/Response).
Rules:
- Do not invent findings, diagnoses, or numbers not present in the transcript.
- Prefer "Not discussed" over fabrication.
- British English spelling.
- clinician_review_flags lists anything uncertain or missing for that template.`;

  const user = `Patient: ${input.patientName}
Appointment type: ${input.appointmentType}
Sections:\n${schemaHint}
${prior}
Transcript:\n${input.transcript}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI organise failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const parsed = JSON.parse(data.choices[0]?.message?.content ?? "{}") as NoteContent;
  if (!Array.isArray(parsed.clinician_review_flags)) {
    parsed.clinician_review_flags = [];
  }
  for (const s of input.sections) {
    if (typeof parsed[s.id] !== "string") {
      parsed[s.id] = "Not discussed — review transcript.";
      parsed.clinician_review_flags.push(`Missing ${s.title}`);
    }
  }
  return parsed;
}
