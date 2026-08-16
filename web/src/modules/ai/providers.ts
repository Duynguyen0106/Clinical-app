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

export type NoteContent = Record<string, string | string[]> & {
  clinician_review_flags: string[];
};

export type OrganiseWithTemplateInput = OrganiseNoteInput & {
  sections: NoteSection[];
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
  const content: NoteContent = {
    clinician_review_flags: [...soap.clinician_review_flags],
  };

  for (const section of input.sections) {
    if (section.id in soap) {
      content[section.id] = soap[section.id as keyof typeof soap] as string;
    } else if (section.id === "red_flags") {
      content[section.id] =
        "Red flags discussed as applicable to presentation — confirm documentation.";
    } else if (section.id === "presentation") {
      content[section.id] = soap.subjective;
    } else if (section.id === "findings") {
      content[section.id] = soap.objective;
    } else if (section.id === "treatment") {
      content[section.id] =
        "Manual / osteopathic techniques as discussed in session — review transcript.";
    } else if (section.id === "techniques") {
      content[section.id] =
        "Soft tissue / joint techniques applied as discussed — edit for accuracy.";
    } else if (section.id === "response") {
      content[section.id] =
        "Patient response during session — confirm from clinical observation.";
    } else {
      content[section.id] = "Not clearly discussed — review transcript.";
      content.clinician_review_flags.push(
        `Section “${section.title}” needs clinician review.`,
      );
    }
  }

  return content;
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

  const system = `You are a UK allied-health clinical scribe for physiotherapy, osteopathy, and manual therapy.
Return ONLY valid JSON with keys: ${sectionIds.join(", ")}, clinician_review_flags (string array).
Rules:
- Do not invent findings, diagnoses, or numbers not present in the transcript.
- Prefer "Not discussed" over fabrication.
- British English spelling.
- clinician_review_flags lists anything uncertain.`;

  const user = `Patient: ${input.patientName}
Appointment type: ${input.appointmentType}
Sections:\n${schemaHint}

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
