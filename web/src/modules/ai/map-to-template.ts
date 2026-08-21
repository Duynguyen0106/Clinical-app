import type { NoteSection } from "@/modules/notes/templates";
import type { SoapNoteContent } from "@/modules/ai/mock-pipeline";

export type OrganisedContent = Record<string, string | string[]> & {
  clinician_review_flags: string[];
};

/**
 * Map a SOAP-shaped draft onto clinic template sections (physio / osteo / manual).
 * Pure — used by mock organise and unit tests.
 */
export function mapSoapToTemplateSections(
  soap: SoapNoteContent,
  sections: NoteSection[],
): OrganisedContent {
  const content: OrganisedContent = {
    clinician_review_flags: [...soap.clinician_review_flags],
  };

  for (const section of sections) {
    const mapped = mapSection(soap, section.id);
    if (mapped != null) {
      content[section.id] = mapped;
    } else {
      content[section.id] =
        "Not clearly discussed — review transcript and complete this section.";
      content.clinician_review_flags.push(
        `Section “${section.title}” needs clinician review.`,
      );
    }
  }

  return content;
}

function mapSection(soap: SoapNoteContent, id: string): string | null {
  switch (id) {
    case "subjective":
      return soap.subjective;
    case "objective":
      return soap.objective;
    case "assessment":
      return soap.assessment;
    case "plan":
      return soap.plan;
    case "red_flags":
      return [
        "Red-flag screen from today's discussion:",
        soap.assessment.includes("red-flag") ||
        soap.subjective.toLowerCase().includes("pins and needles")
          ? "Neurological symptoms (pins and needles / distal symptoms) asked; none reported beyond local ache."
          : "No clear red-flag discussion captured — confirm Cauda Equina / cancer / infection / fracture screen as clinically indicated.",
        "Night pain trend noted in subjective — reassess if progressive or unexplained weight loss.",
      ].join(" ");
    case "presentation":
      // Osteopathy session language
      return [
        "Presenting complaint:",
        soap.subjective,
      ].join(" ");
    case "findings":
      return [
        "Examination findings:",
        soap.objective,
        "Clinical impression:",
        soap.assessment,
      ].join(" ");
    case "treatment":
      return [
        "Treatment today (confirm techniques from session):",
        "Manual / osteopathic techniques as discussed with the patient.",
        "Addressed irritability of the presenting region with progressive loading advice aligned to plan.",
      ].join(" ");
    case "techniques":
      return [
        "Techniques applied (edit for accuracy):",
        "Soft tissue and joint techniques as indicated by examination findings.",
        soap.objective,
      ].join(" ");
    case "response":
      return [
        "Patient response during / after techniques:",
        "Tolerated treatment; symptoms discussed as improved night pain with residual overhead irritability.",
        "Reassess response at next review.",
      ].join(" ");
    default:
      return null;
  }
}

type TemplateRow = { id: string; name: string; isDefault: boolean };

/**
 * Choose the best note template for an appointment type name.
 * Pure matching — DB fetch happens in the visit service.
 */
export function matchTemplateForAppointment(
  appointmentTypeName: string,
  templates: TemplateRow[],
): TemplateRow | null {
  if (templates.length === 0) return null;

  const lower = appointmentTypeName.toLowerCase();
  const nameOf = (t: TemplateRow) => t.name.toLowerCase();

  const exact = templates.find((t) => nameOf(t) === lower);
  if (exact) return exact;

  const scored = templates
    .map((t) => ({ t, score: scoreTemplateMatch(lower, nameOf(t)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored[0]) return scored[0].t;

  return templates.find((t) => t.isDefault) ?? templates[0] ?? null;
}

function scoreTemplateMatch(appointmentLower: string, templateLower: string): number {
  let score = 0;

  if (appointmentLower.includes("osteo") && templateLower.includes("osteo")) {
    score += 40;
  }
  if (appointmentLower.includes("manual") && templateLower.includes("manual")) {
    score += 40;
  }
  if (appointmentLower.includes("physio") && templateLower.includes("physio")) {
    score += 20;
  }

  const isFollowUp =
    appointmentLower.includes("follow-up") ||
    appointmentLower.includes("followup") ||
    appointmentLower.includes("follow up") ||
    appointmentLower.includes("review");
  const isInitial =
    appointmentLower.includes("initial") ||
    appointmentLower.includes("new") ||
    appointmentLower.includes("assessment");

  if (isFollowUp && (templateLower.includes("review") || templateLower.includes("follow"))) {
    score += 35;
  }
  if (isInitial && templateLower.includes("initial")) {
    score += 35;
  }
  // Prefer review over initial when follow-up wording is present
  if (isFollowUp && templateLower.includes("initial")) {
    score -= 15;
  }

  if (templateLower.includes("soap") && score === 0) {
    score += 1;
  }

  return score;
}

export function extractSectionsFromSchema(schema: unknown): NoteSection[] {
  if (
    schema &&
    typeof schema === "object" &&
    Array.isArray((schema as { sections?: unknown }).sections)
  ) {
    return (schema as { sections: NoteSection[] }).sections;
  }
  return [
    { id: "subjective", title: "Subjective", type: "markdown" },
    { id: "objective", title: "Objective", type: "markdown" },
    { id: "assessment", title: "Assessment", type: "markdown" },
    { id: "plan", title: "Plan", type: "markdown" },
  ];
}

/** Labels for draft editors — prefer template section titles. */
export function sectionLabel(
  sectionId: string,
  sections?: NoteSection[] | null,
): string {
  const fromTpl = sections?.find((s) => s.id === sectionId)?.title;
  if (fromTpl) return fromTpl;
  return sectionId.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Ordered field ids for a note draft. */
export function orderedSectionIds(
  contentKeys: string[],
  sections?: NoteSection[] | null,
): string[] {
  const keys = contentKeys.filter((k) => k !== "clinician_review_flags");
  if (!sections?.length) return keys;
  const ordered = sections.map((s) => s.id).filter((id) => keys.includes(id));
  const extras = keys.filter((k) => !ordered.includes(k));
  return [...ordered, ...extras];
}
