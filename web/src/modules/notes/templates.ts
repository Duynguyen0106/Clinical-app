/**
 * Starter clinical note templates for UK mixed MSK clinics.
 * Addresses a Cliniko gap: only two default templates out of the box.
 */

export type NoteSectionType = "markdown" | "body_map";

export type NoteSection = {
  id: string;
  title: string;
  type: NoteSectionType;
  hint?: string;
};

export type NoteTemplateDef = {
  id: string;
  name: string;
  discipline: "physio" | "osteo" | "manual" | "shared";
  isDefault?: boolean;
  sections: NoteSection[];
};

const BODY_MAP_SECTION: NoteSection = {
  id: "body_map",
  title: "Body chart",
  type: "body_map",
  hint: "Mark pain, lesions, and somatic dysfunction on anatomy views",
};

const SOAP_SECTIONS: NoteSection[] = [
  {
    id: "subjective",
    title: "Subjective",
    type: "markdown",
    hint: "History, symptoms, aggravating / easing factors",
  },
  {
    id: "objective",
    title: "Objective",
    type: "markdown",
    hint: "Observation, ROM, special tests, palpation",
  },
  BODY_MAP_SECTION,
  {
    id: "assessment",
    title: "Assessment",
    type: "markdown",
    hint: "Clinical impression — do not invent findings",
  },
  {
    id: "plan",
    title: "Plan",
    type: "markdown",
    hint: "Treatment given, HEP, advice, follow-up timing",
  },
];

export const MSK_TEMPLATE_PACK: NoteTemplateDef[] = [
  {
    id: "tpl_physio_initial",
    name: "Physio · Initial assessment",
    discipline: "physio",
    isDefault: true,
    sections: [
      ...SOAP_SECTIONS,
      {
        id: "red_flags",
        title: "Red flags screened",
        type: "markdown",
        hint: "Record what was asked / ruled out",
      },
    ],
  },
  {
    id: "tpl_physio_review",
    name: "Physio · Review",
    discipline: "physio",
    sections: SOAP_SECTIONS,
  },
  {
    id: "tpl_osteo_session",
    name: "Osteopathy session",
    discipline: "osteo",
    sections: [
      {
        id: "presentation",
        title: "Presentation",
        type: "markdown",
      },
      {
        id: "findings",
        title: "Findings",
        type: "markdown",
      },
      BODY_MAP_SECTION,
      {
        id: "treatment",
        title: "Treatment",
        type: "markdown",
      },
      {
        id: "plan",
        title: "Plan & advice",
        type: "markdown",
      },
    ],
  },
  {
    id: "tpl_manual_therapy",
    name: "Manual therapy",
    discipline: "manual",
    sections: [
      {
        id: "subjective",
        title: "Subjective",
        type: "markdown",
      },
      BODY_MAP_SECTION,
      {
        id: "techniques",
        title: "Techniques applied",
        type: "markdown",
      },
      {
        id: "response",
        title: "Response",
        type: "markdown",
      },
      {
        id: "plan",
        title: "Plan",
        type: "markdown",
      },
    ],
  },
  {
    id: "tpl_soap",
    name: "Generic SOAP",
    discipline: "shared",
    sections: SOAP_SECTIONS,
  },
];

export function parseTemplateSections(schema: unknown): NoteSection[] {
  if (!schema || typeof schema !== "object") return [];
  const sections = (schema as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  return sections
    .map((s): NoteSection | null => {
      if (!s || typeof s !== "object") return null;
      const row = s as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.title !== "string") {
        return null;
      }
      const type: NoteSectionType =
        row.type === "body_map" ? "body_map" : "markdown";
      return {
        id: row.id,
        title: row.title,
        type,
        hint: typeof row.hint === "string" ? row.hint : undefined,
      };
    })
    .filter((s): s is NoteSection => Boolean(s));
}
