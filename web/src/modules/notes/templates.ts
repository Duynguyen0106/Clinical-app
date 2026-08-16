/**
 * Starter clinical note templates for UK mixed MSK clinics.
 * Addresses a Cliniko gap: only two default templates out of the box.
 */

export type NoteSection = {
  id: string;
  title: string;
  type: "markdown";
  hint?: string;
};

export type NoteTemplateDef = {
  id: string;
  name: string;
  discipline: "physio" | "osteo" | "manual" | "shared";
  isDefault?: boolean;
  sections: NoteSection[];
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
    name: "SOAP (generic)",
    discipline: "shared",
    sections: SOAP_SECTIONS,
  },
];
