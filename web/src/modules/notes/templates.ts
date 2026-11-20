/**
 * Starter clinical note templates for UK mixed MSK clinics.
 * Addresses a Cliniko gap: only two default templates out of the box.
 *
 * Hints are clinician prompts shown above each field — keep them specific
 * enough to support thorough documentation without inventing findings.
 */

import { BODY_MAP_CONTENT_KEY } from "@/modules/notes/body-map";

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
  id: BODY_MAP_CONTENT_KEY,
  title: "Body chart",
  type: "body_map",
  hint:
    "Mark pain location/radiation, tenderness, lesions, and somatic dysfunction on relevant anatomy views",
};

/** Shared SOAP core with detailed UK MSK prompts. */
const SOAP_SECTIONS: NoteSection[] = [
  {
    id: "subjective",
    title: "Subjective",
    type: "markdown",
    hint:
      "Presenting complaint; onset & mechanism; nature/severity (e.g. VAS); site & radiation; 24h pattern; sleep; aggravating / easing; previous episodes; patient goals",
  },
  {
    id: "objective",
    title: "Objective",
    type: "markdown",
    hint:
      "Observation & posture; gait; active/passive ROM with end-feel; strength; neuro screen if indicated; special tests (name + result); palpation findings",
  },
  BODY_MAP_SECTION,
  {
    id: "assessment",
    title: "Assessment",
    type: "markdown",
    hint:
      "Working clinical impression / differential; irritability & severity; contraindications or cautions — do not invent findings",
  },
  {
    id: "plan",
    title: "Plan",
    type: "markdown",
    hint:
      "Treatment given today; home exercise / advice; activity modification; expected response; follow-up timing; safety-netting",
  },
];

export const MSK_TEMPLATE_PACK: NoteTemplateDef[] = [
  {
    id: "tpl_physio_initial",
    name: "Physio · Initial assessment",
    discipline: "physio",
    isDefault: true,
    sections: [
      {
        id: "subjective",
        title: "Subjective / history",
        type: "markdown",
        hint:
          "PC & HPC; onset/mechanism; behaviour of symptoms; aggravating/easing; 24h & night pain; previous Rx; yellow flags if relevant; patient goals",
      },
      {
        id: "past_medical",
        title: "Past medical / medications",
        type: "markdown",
        hint:
          "PMH, surgery, trauma; current medications & allergies; relevant imaging / investigations",
      },
      {
        id: "objective",
        title: "Objective examination",
        type: "markdown",
        hint:
          "Observation; ROM (A/P) with quality; strength; neuro (myotomes/dermatomes/reflexes if indicated); special tests with clear +/−; palpation",
      },
      BODY_MAP_SECTION,
      {
        id: "assessment",
        title: "Assessment",
        type: "markdown",
        hint:
          "Clinical impression and differentials; severity/irritability; prognosis factors — do not invent findings",
      },
      {
        id: "plan",
        title: "Treatment & plan",
        type: "markdown",
        hint:
          "Techniques / education today; HEP with dosage; advice & activity pacing; follow-up plan; shared decision notes",
      },
      {
        id: "goals",
        title: "Goals & consent",
        type: "markdown",
        hint:
          "Agreed goals (function/activity); informed consent for assessment & treatment; any refusal or limits recorded",
      },
      {
        id: "red_flags",
        title: "Red flags screened",
        type: "markdown",
        hint:
          "Record what was asked and ruled out (e.g. CES, unremitting night pain, unexplained weight loss, fever/infection, fracture risk, progressive neuro deficit)",
      },
    ],
  },
  {
    id: "tpl_physio_review",
    name: "Physio · Review",
    discipline: "physio",
    sections: [
      {
        id: "progress_since_last",
        title: "Progress since last visit",
        type: "markdown",
        hint:
          "Change in symptoms/function; HEP adherence; new events or flares; response to last treatment",
      },
      {
        id: "subjective",
        title: "Subjective today",
        type: "markdown",
        hint:
          "Current symptoms; aggravating/easing; sleep; activity tolerance; patient-reported change",
      },
      {
        id: "objective",
        title: "Objective today",
        type: "markdown",
        hint:
          "Re-test key markers (ROM, strength, special tests, functional tasks); compare to baseline",
      },
      BODY_MAP_SECTION,
      {
        id: "outcome_measures",
        title: "Outcome measures",
        type: "markdown",
        hint:
          "Repeat scores if used (e.g. NPRS/VAS, PSFS, condition-specific PROMs) with date",
      },
      {
        id: "assessment",
        title: "Assessment",
        type: "markdown",
        hint:
          "Updated impression; progress vs plan; barriers — do not invent findings",
      },
      {
        id: "plan",
        title: "Treatment & plan",
        type: "markdown",
        hint:
          "Treatment today; updated HEP; progression/regression; next review or discharge criteria",
      },
    ],
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
        hint:
          "Presenting complaint; onset & mechanism; quality/severity; site & radiation; 24h pattern; sleep; aggravating/easing; impact on work/ADL; patient goals",
      },
      {
        id: "history",
        title: "Case history",
        type: "markdown",
        hint:
          "PMH, surgery, trauma; medications & allergies; previous osteopathy/physio/chiro; relevant systems review",
      },
      {
        id: "findings",
        title: "Examination findings",
        type: "markdown",
        hint:
          "Observation/posture; active & passive ROM; orthopaedic tests; neuro screen if indicated; palpation (TART: tissue, asymmetry, restriction, tenderness)",
      },
      BODY_MAP_SECTION,
      {
        id: "assessment",
        title: "Clinical impression",
        type: "markdown",
        hint:
          "Osteopathic diagnosis / working impression; key somatic dysfunctions; cautions or contraindications — do not invent findings",
      },
      {
        id: "treatment",
        title: "Treatment",
        type: "markdown",
        hint:
          "Techniques used (e.g. ST, articulation, MET, HVLA, cranial) with regions; consent obtained; dosage/intensity; patient position",
      },
      {
        id: "response",
        title: "Response",
        type: "markdown",
        hint:
          "Immediate response during/after treatment; adverse effects if any; re-test findings",
      },
      {
        id: "plan",
        title: "Plan & advice",
        type: "markdown",
        hint:
          "Aftercare advice; HEP; activity modification; expected soreness window; follow-up timing; safety-netting",
      },
      {
        id: "red_flags",
        title: "Red flags screened",
        type: "markdown",
        hint:
          "Record screens completed (CES, infection, fracture, malignancy indicators, progressive neuro) and outcomes",
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
        hint:
          "Today’s complaint & change since last; irritability; goals for this session",
      },
      {
        id: "objective",
        title: "Objective",
        type: "markdown",
        hint:
          "Key re-tests; tissue quality; ROM; pain on movement; relevant special tests",
      },
      BODY_MAP_SECTION,
      {
        id: "techniques",
        title: "Techniques applied",
        type: "markdown",
        hint:
          "List techniques, regions, grade/dosage, and rationale; note consent",
      },
      {
        id: "response",
        title: "Response",
        type: "markdown",
        hint:
          "In-session and immediate post-treatment response; any adverse effects",
      },
      {
        id: "plan",
        title: "Plan",
        type: "markdown",
        hint:
          "HEP / self-care; activity advice; next session focus and timing",
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
        id: type === "body_map" ? BODY_MAP_CONTENT_KEY : row.id,
        title: row.title,
        type,
        hint: typeof row.hint === "string" ? row.hint : undefined,
      };
    })
    .filter((s): s is NoteSection => Boolean(s));
}

/** Pack template lookup by display name (seed / clinic sync). */
export function packTemplateByName(name: string): NoteTemplateDef | undefined {
  return MSK_TEMPLATE_PACK.find((t) => t.name === name);
}
