/**
 * Structured body-chart findings for clinical notes.
 * Stored on ClinicalNote.content.body_map (JSON); included in sign hash & print.
 */

import { z } from "zod";

export const BODY_MAP_CONTENT_KEY = "body_map" as const;

export const BODY_MAP_VIEWS = [
  "anterior",
  "posterior",
  "left_lateral",
  "right_lateral",
  "spine",
  "cervical",
  "plantar",
] as const;

export type BodyMapViewId = (typeof BODY_MAP_VIEWS)[number];

export const BODY_MAP_MARK_KINDS = [
  "pain",
  "lesion",
  "somatic_dysfunction",
] as const;

export type BodyMapMarkKind = (typeof BODY_MAP_MARK_KINDS)[number];

export const LESION_TYPES = [
  "bruise",
  "scar",
  "rash",
  "swelling",
  "wound",
  "other",
] as const;

export type LesionType = (typeof LESION_TYPES)[number];

export const SOMATIC_FINDINGS = [
  "tenderness",
  "asymmetry",
  "restriction",
  "tissue_texture",
  "TART",
  "other",
] as const;

export type SomaticFinding = (typeof SOMATIC_FINDINGS)[number];

export const BODY_SIDES = ["left", "right", "bilateral", "midline"] as const;
export type BodySide = (typeof BODY_SIDES)[number];

export const MAX_BODY_MAP_MARKS = 80;
export const MAX_MARK_NOTE_LEN = 400;
export const MAX_MARK_REGION_LEN = 80;

export type BodyMapMark = {
  id: string;
  kind: BodyMapMarkKind;
  view: BodyMapViewId;
  /** Normalised 0–1 within the view viewBox */
  x: number;
  y: number;
  intensity?: number;
  lesionType?: LesionType;
  region?: string;
  dysfunction?: SomaticFinding;
  side?: BodySide;
  note?: string;
  createdAt: string;
};

export type BodyMapContent = {
  version: 1;
  activeView: BodyMapViewId;
  marks: BodyMapMark[];
};

const markSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum(BODY_MAP_MARK_KINDS),
    view: z.enum(BODY_MAP_VIEWS),
    x: z.number().finite(),
    y: z.number().finite(),
    intensity: z.number().finite().optional(),
    lesionType: z.enum(LESION_TYPES).optional(),
    region: z.string().optional(),
    dysfunction: z.enum(SOMATIC_FINDINGS).optional(),
    side: z.enum(BODY_SIDES).optional(),
    note: z.string().optional(),
    createdAt: z.string().trim().min(1).max(64).optional(),
  })
  .transform((m): BodyMapMark => {
    const x = clamp01(m.x);
    const y = clamp01(m.y);
    const out: BodyMapMark = {
      id: m.id.slice(0, 80),
      kind: m.kind,
      view: m.view,
      x,
      y,
      createdAt: m.createdAt || new Date().toISOString(),
    };
    if (m.kind === "pain") {
      out.intensity = clampInt(m.intensity ?? 0, 0, 10);
    }
    if (m.kind === "lesion" && m.lesionType) {
      out.lesionType = m.lesionType;
    }
    if (m.kind === "somatic_dysfunction") {
      if (m.dysfunction) out.dysfunction = m.dysfunction;
      if (m.region?.trim()) {
        out.region = m.region.trim().slice(0, MAX_MARK_REGION_LEN);
      }
    }
    if (m.side) out.side = m.side;
    if (m.note?.trim()) {
      out.note = m.note.trim().slice(0, MAX_MARK_NOTE_LEN);
    }
    return out;
  });

export const bodyMapContentSchema = z
  .object({
    version: z.literal(1),
    activeView: z.enum(BODY_MAP_VIEWS).default("posterior"),
    marks: z.array(z.unknown()).max(MAX_BODY_MAP_MARKS).default([]),
  })
  .transform((raw): BodyMapContent => {
    const marks: BodyMapMark[] = [];
    for (const item of raw.marks) {
      const parsed = markSchema.safeParse(item);
      if (parsed.success) marks.push(parsed.data);
      if (marks.length >= MAX_BODY_MAP_MARKS) break;
    }
    return {
      version: 1,
      activeView: raw.activeView,
      marks,
    };
  });

export function emptyBodyMap(
  activeView: BodyMapViewId = "posterior",
): BodyMapContent {
  return { version: 1, activeView, marks: [] };
}

export function isBodyMapContent(value: unknown): value is BodyMapContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as BodyMapContent;
  return (
    v.version === 1 &&
    typeof v.activeView === "string" &&
    Array.isArray(v.marks)
  );
}

/** Normalise any body-map-shaped value; invalid input → empty map. */
export function sanitizeBodyMap(value: unknown): BodyMapContent {
  const parsed = bodyMapContentSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyBodyMap();
}

/**
 * Read body_map from note content. Migrates misplaced keys that look like
 * body-map objects onto the canonical BODY_MAP_CONTENT_KEY.
 */
export function parseBodyMap(content: unknown): BodyMapContent {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return emptyBodyMap();
  }
  const raw = content as Record<string, unknown>;
  let best = sanitizeBodyMap(raw[BODY_MAP_CONTENT_KEY]);
  for (const [key, val] of Object.entries(raw)) {
    if (key === BODY_MAP_CONTENT_KEY) continue;
    if (!isBodyMapContent(val) && !looksLikeBodyMap(val)) continue;
    const alt = sanitizeBodyMap(val);
    if (alt.marks.length > best.marks.length) best = alt;
  }
  return best;
}

function looksLikeBodyMap(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as { version?: unknown; marks?: unknown };
  return v.version === 1 && Array.isArray(v.marks);
}

/**
 * Canonicalise note JSON before persist/sign:
 * - one body_map under BODY_MAP_CONTENT_KEY
 * - drop misplaced body-map objects
 * - preserve clinician marks when incoming map is empty (re-organise)
 */
export function sanitizeNoteContent(
  content: Record<string, unknown>,
  opts: { preserveBodyMapFrom?: unknown } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content };
  let map = parseBodyMap(out);

  for (const key of Object.keys(out)) {
    if (key === BODY_MAP_CONTENT_KEY) continue;
    if (isBodyMapContent(out[key]) || looksLikeBodyMap(out[key])) {
      delete out[key];
    }
  }

  if (opts.preserveBodyMapFrom) {
    const prev = parseBodyMap(opts.preserveBodyMapFrom);
    if (prev.marks.length > 0 && map.marks.length === 0) {
      map = prev;
    }
  }

  out[BODY_MAP_CONTENT_KEY] = map;
  return out;
}

export function viewLabel(view: BodyMapViewId): string {
  switch (view) {
    case "anterior":
      return "Anterior";
    case "posterior":
      return "Posterior";
    case "left_lateral":
      return "Left lateral";
    case "right_lateral":
      return "Right lateral";
    case "spine":
      return "Spine";
    case "cervical":
      return "Cervical";
    case "plantar":
      return "Plantar feet";
    default:
      return view;
  }
}

export function kindLabel(kind: BodyMapMarkKind): string {
  switch (kind) {
    case "pain":
      return "Pain";
    case "lesion":
      return "Lesion";
    case "somatic_dysfunction":
      return "Somatic dysfunction";
    default:
      return kind;
  }
}

export function markSummary(mark: BodyMapMark): string {
  const bits: string[] = [kindLabel(mark.kind), viewLabel(mark.view)];
  if (mark.kind === "pain" && mark.intensity != null) {
    bits.push(`NRS ${mark.intensity}/10`);
  }
  if (mark.kind === "lesion" && mark.lesionType) {
    bits.push(mark.lesionType.replace(/_/g, " "));
  }
  if (mark.kind === "somatic_dysfunction") {
    if (mark.region) bits.push(mark.region);
    if (mark.dysfunction) bits.push(mark.dysfunction.replace(/_/g, " "));
  }
  if (mark.side) bits.push(mark.side);
  if (mark.note?.trim()) bits.push(mark.note.trim());
  return bits.join(" · ");
}

export function bodyMapPrintLines(map: BodyMapContent): string[] {
  if (map.marks.length === 0) return [];
  return map.marks.map((m, i) => `${i + 1}. ${markSummary(m)}`);
}

export function newMarkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Merge body_map into note content without clobbering text sections. */
export function withBodyMap(
  content: Record<string, unknown>,
  map: BodyMapContent,
): Record<string, unknown> {
  return { ...content, [BODY_MAP_CONTENT_KEY]: sanitizeBodyMap(map) };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
