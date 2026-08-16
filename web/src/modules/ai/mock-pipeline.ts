/**
 * Mock AI adapters for local/demo use (no API keys required).
 * Swap implementations via AI_PROVIDER env (mock | deepgram | openai …).
 */

export type SoapNoteContent = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  clinician_review_flags: string[];
};

export type OrganiseNoteInput = {
  transcript: string;
  patientName: string;
  appointmentType: string;
  priorContext?: string;
};

const DEMO_TRANSCRIPT = `Practitioner: Hi Sarah, how has the right shoulder been since last week?
Patient: Still sore reaching overhead, but the night pain is better. Sleeping on my back helps.
Practitioner: Any pins and needles down the arm?
Patient: No, just local ache around the top of the shoulder.
Practitioner: On exam today, flexion to about 140 degrees, abduction to 150. Empty can mildly positive. Strength roughly four out of five for external rotation. No cervical reproduction of symptoms.
Practitioner: We'll continue rotator cuff loading, add scapular control, and review in two weeks. Ice after heavier days if needed.`;

export async function mockTranscribe(audioRef: string): Promise<string> {
  void audioRef;
  await delay(800);
  return DEMO_TRANSCRIPT;
}

export async function mockOrganiseNote(
  input: OrganiseNoteInput,
): Promise<SoapNoteContent> {
  await delay(1200);

  const lower = input.transcript.toLowerCase();
  const flags: string[] = [];

  if (!lower.includes("strength") && !lower.includes("exam")) {
    flags.push("Limited objective findings in transcript — review carefully.");
  }

  return {
    subjective: [
      `${input.patientName} reports ongoing right shoulder discomfort with overhead reach.`,
      "Night pain improved; sleeping supine is more comfortable.",
      "Denies pins and needles or distal neurological symptoms.",
      "Symptoms remain local to the superior shoulder.",
    ].join(" "),
    objective: [
      "Active flexion ~140°, abduction ~150°.",
      "Empty can mildly positive.",
      "External rotation strength ~4/5.",
      "No cervical reproduction of shoulder symptoms noted in today's discussion.",
    ].join(" "),
    assessment: [
      `Working impression consistent with rotator cuff–related shoulder pain (${input.appointmentType}).`,
      "Improving night pain; residual overhead irritability.",
      "No red-flag neurological symptoms reported today.",
    ].join(" "),
    plan: [
      "Continue progressive rotator cuff loading and scapular control exercises.",
      "Advise relative rest from aggravating overhead activity; ice after heavier days PRN.",
      "Review in 2 weeks — book follow-up.",
    ].join(" "),
    clinician_review_flags: flags,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
