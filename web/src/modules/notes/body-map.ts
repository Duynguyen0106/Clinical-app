/**
 * Structured body-chart findings for clinical notes.
 * Stored on ClinicalNote.content.body_map (JSON); included in sign hash & print.
 */

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

export function parseBodyMap(content: unknown): BodyMapContent {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return emptyBodyMap();
  }
  const raw = content as Record<string, unknown>;
  const nested = raw[BODY_MAP_CONTENT_KEY];
  if (isBodyMapContent(nested)) {
    return {
      version: 1,
      activeView: BODY_MAP_VIEWS.includes(nested.activeView)
        ? nested.activeView
        : "posterior",
      marks: nested.marks.filter(isValidMark),
    };
  }
  return emptyBodyMap();
}

function isValidMark(m: unknown): m is BodyMapMark {
  if (!m || typeof m !== "object") return false;
  const mark = m as BodyMapMark;
  return (
    typeof mark.id === "string" &&
    BODY_MAP_MARK_KINDS.includes(mark.kind) &&
    BODY_MAP_VIEWS.includes(mark.view) &&
    typeof mark.x === "number" &&
    typeof mark.y === "number" &&
    mark.x >= 0 &&
    mark.x <= 1 &&
    mark.y >= 0 &&
    mark.y <= 1
  );
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
  return { ...content, [BODY_MAP_CONTENT_KEY]: map };
}
