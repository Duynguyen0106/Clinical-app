/**
 * Structured body-chart findings for clinical notes.
 * Stored on ClinicalNote.content.body_map (JSON); included in sign hash & print.
 */

import { z } from "zod";
import { sanitizeAnatomySvgAllowlist } from "@/modules/notes/svg-allowlist";

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

export type BuiltinBodyMapViewId = (typeof BODY_MAP_VIEWS)[number];
/** Builtin views plus clinic custom_* SVG overlays. */
export type BodyMapViewId = BuiltinBodyMapViewId | (string & {});

export const BODY_MAP_MARK_KINDS = [
  "pain",
  "lesion",
  "somatic_dysfunction",
] as const;

export type BodyMapMarkKind = (typeof BODY_MAP_MARK_KINDS)[number];

export const BODY_MAP_SHAPES = ["point", "path", "polygon"] as const;
export type BodyMapShape = (typeof BODY_MAP_SHAPES)[number];

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
export const MAX_MARK_POINTS = 64;
export const MAX_MARK_NOTE_LEN = 400;
export const MAX_MARK_REGION_LEN = 80;

export type BodyMapPoint = { x: number; y: number };

export type BodyMapMark = {
  id: string;
  kind: BodyMapMarkKind;
  view: BodyMapViewId;
  /** Anchor / centroid (normalised 0–1) */
  x: number;
  y: number;
  shape?: BodyMapShape;
  /** Freehand path or polygon vertices (normalised 0–1) */
  points?: BodyMapPoint[];
  intensity?: number;
  lesionType?: LesionType;
  region?: string;
  dysfunction?: SomaticFinding;
  side?: BodySide;
  note?: string;
  createdAt: string;
};

export type BodyChartCustomView = {
  id: string;
  label: string;
  /** Sanitised SVG markup (viewBox preferably 0 0 200 360) */
  svg: string;
};

export type BodyMapContent = {
  version: 1;
  activeView: BodyMapViewId;
  marks: BodyMapMark[];
  /**
   * Frozen custom anatomy overlays referenced by marks.
   * Prefer these over live clinic config when rendering/printing signed notes.
   */
  viewSnapshots?: BodyChartCustomView[];
};

export type BodyChartConfig = {
  customViews: BodyChartCustomView[];
  /** Soft-deleted overlays kept so historical marks can still render. */
  archivedViews?: BodyChartCustomView[];
};

export const MAX_ARCHIVED_CUSTOM_VIEWS = 48;

export function isBuiltinView(view: string): view is BuiltinBodyMapViewId {
  return (BODY_MAP_VIEWS as readonly string[]).includes(view);
}

export function isBodyMapViewId(view: string): boolean {
  return isBuiltinView(view) || /^custom_[a-z0-9_-]{1,40}$/i.test(view);
}

const pointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .transform((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));

const markSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum(BODY_MAP_MARK_KINDS),
    view: z.string().trim().min(1).max(64),
    x: z.number().finite(),
    y: z.number().finite(),
    shape: z.enum(BODY_MAP_SHAPES).optional(),
    points: z.array(z.unknown()).max(MAX_MARK_POINTS).optional(),
    intensity: z.number().finite().optional(),
    lesionType: z.enum(LESION_TYPES).optional(),
    region: z.string().optional(),
    dysfunction: z.enum(SOMATIC_FINDINGS).optional(),
    side: z.enum(BODY_SIDES).optional(),
    note: z.string().optional(),
    createdAt: z.string().trim().min(1).max(64).optional(),
  })
  .transform((m): BodyMapMark | null => {
    if (!isBodyMapViewId(m.view)) return null;
    const x = clamp01(m.x);
    const y = clamp01(m.y);
    let shape: BodyMapShape = m.shape ?? "point";
    let points: BodyMapPoint[] | undefined;
    if (m.points?.length) {
      const collected: BodyMapPoint[] = [];
      for (const raw of m.points) {
        const p = pointSchema.safeParse(raw);
        if (p.success) collected.push(p.data);
        if (collected.length >= MAX_MARK_POINTS) break;
      }
      if (shape === "point") {
        shape =
          collected.length >= 3
            ? "polygon"
            : collected.length >= 2
              ? "path"
              : "point";
      }
      const okPath = shape === "path" && collected.length >= 2;
      const okPoly = shape === "polygon" && collected.length >= 3;
      if (okPath || okPoly) {
        points = collected;
      } else {
        shape = "point";
        points = undefined;
      }
    } else {
      shape = "point";
    }

    const out: BodyMapMark = {
      id: m.id.slice(0, 80),
      kind: m.kind,
      view: m.view,
      x,
      y,
      shape,
      // Stable default — regenerating Date.now() on each sanitize churns sign hash
      createdAt: m.createdAt || "1970-01-01T00:00:00.000Z",
    };
    if (points?.length) out.points = points;
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
    activeView: z.string().trim().min(1).max(64).default("posterior"),
    // No .max() here — over-cap must truncate, not failParse→empty (data loss)
    marks: z.array(z.unknown()).default([]),
    viewSnapshots: z.array(z.unknown()).optional(),
  })
  .transform((raw): BodyMapContent => {
    const marks: BodyMapMark[] = [];
    const seenIds = new Set<string>();
    for (const item of raw.marks) {
      const parsed = markSchema.safeParse(item);
      if (!parsed.success || !parsed.data) continue;
      const mark = parsed.data;
      // Dedupe ids so removeMark / React keys stay deterministic
      if (seenIds.has(mark.id)) continue;
      seenIds.add(mark.id);
      marks.push(mark);
      if (marks.length >= MAX_BODY_MAP_MARKS) break;
    }
    const activeView = isBodyMapViewId(raw.activeView)
      ? raw.activeView
      : "posterior";
    const needed = new Set<string>();
    for (const m of marks) {
      if (!isBuiltinView(m.view)) needed.add(m.view);
    }
    if (!isBuiltinView(activeView)) needed.add(activeView);
    // Keep needed first, then any extra prior snapshots (re-mark freeze)
    const viewSnapshots = sanitizeViewSnapshots(raw.viewSnapshots, needed, true);
    return {
      version: 1,
      activeView,
      marks,
      ...(viewSnapshots.length ? { viewSnapshots } : {}),
    };
  });

function sanitizeViewSnapshots(
  raw: unknown,
  needed: Set<string>,
  keepExtra = false,
): BodyChartCustomView[] {
  if (!Array.isArray(raw)) return [];
  const neededOut: BodyChartCustomView[] = [];
  const extraOut: BodyChartCustomView[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const view = parseCustomViewRow(row);
    if (!view || seen.has(view.id)) continue;
    seen.add(view.id);
    if (needed.has(view.id)) neededOut.push(view);
    else if (keepExtra) extraOut.push(view);
    if (neededOut.length + extraOut.length >= MAX_ARCHIVED_CUSTOM_VIEWS) break;
  }
  return [...neededOut, ...extraOut].slice(0, MAX_ARCHIVED_CUSTOM_VIEWS);
}

/**
 * Ensure custom views used by marks are snapshotted onto the map.
 * Preference: incoming map snapshots → prior note snapshots → live clinic.
 * Retains prior unused snapshots (capped) so clearing then re-marking stays frozen.
 */
export function attachViewSnapshots(
  map: BodyMapContent,
  clinicViews: BodyChartCustomView[],
  priorSnapshots: BodyChartCustomView[] = [],
): BodyMapContent {
  const needed = new Set<string>();
  for (const m of map.marks) {
    if (!isBuiltinView(m.view)) needed.add(m.view);
  }
  if (!isBuiltinView(map.activeView)) needed.add(map.activeView);

  const byId = new Map<string, BodyChartCustomView>();
  // Incoming first, then prior DB overwrites (frozen history wins), clinic fills gaps
  for (const v of map.viewSnapshots ?? []) byId.set(v.id, v);
  for (const v of priorSnapshots) byId.set(v.id, v);
  for (const v of clinicViews) {
    if (needed.has(v.id) && !byId.has(v.id)) byId.set(v.id, v);
  }

  // Prefer needed ids, then retain other frozen snapshots up to cap
  const neededViews: BodyChartCustomView[] = [];
  const extras: BodyChartCustomView[] = [];
  for (const [id, v] of byId) {
    if (needed.has(id)) neededViews.push(v);
    else extras.push(v);
  }
  const viewSnapshots = [...neededViews, ...extras].slice(
    0,
    MAX_ARCHIVED_CUSTOM_VIEWS,
  );
  if (viewSnapshots.length === 0) {
    const { viewSnapshots: _drop, ...rest } = map;
    void _drop;
    return rest;
  }
  return { ...map, viewSnapshots };
}

/** Prefer note snapshots over live clinic views when resolving SVG for print/editor. */
export function resolveCustomViewsForMap(
  map: BodyMapContent,
  clinicViews: BodyChartCustomView[] = [],
): BodyChartCustomView[] {
  const byId = new Map<string, BodyChartCustomView>();
  for (const v of clinicViews) byId.set(v.id, v);
  for (const v of map.viewSnapshots ?? []) byId.set(v.id, v); // snapshots win
  return [...byId.values()];
}

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

export function viewLabel(
  view: BodyMapViewId,
  customViews?: BodyChartCustomView[],
): string {
  if (isBuiltinView(view)) {
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
  const custom = customViews?.find((v) => v.id === view);
  return custom?.label ?? view.replace(/^custom_/, "").replace(/_/g, " ");
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

export function markSummary(
  mark: BodyMapMark,
  customViews?: BodyChartCustomView[],
): string {
  const bits: string[] = [
    kindLabel(mark.kind),
    viewLabel(mark.view, customViews),
  ];
  if (mark.shape && mark.shape !== "point") bits.push(mark.shape);
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

/**
 * Print/GP text lines numbered per-view to match BodyMapPrintFigure callouts.
 */
export function bodyMapPrintLines(
  map: BodyMapContent,
  customViews?: BodyChartCustomView[],
): string[] {
  if (map.marks.length === 0) return [];
  const views: BodyMapViewId[] = [];
  for (const m of map.marks) {
    if (!views.includes(m.view)) views.push(m.view);
  }
  views.sort((a, b) => {
    const ai = BODY_MAP_VIEWS.indexOf(a as (typeof BODY_MAP_VIEWS)[number]);
    const bi = BODY_MAP_VIEWS.indexOf(b as (typeof BODY_MAP_VIEWS)[number]);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return String(a).localeCompare(String(b));
  });
  const lines: string[] = [];
  for (const view of views) {
    const marks = map.marks.filter((m) => m.view === view);
    lines.push(`${viewLabel(view, customViews)}:`);
    marks.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${markSummary(m, customViews)}`);
    });
  }
  return lines;
}

export function centroid(points: BodyMapPoint[]): BodyMapPoint {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function pointsToSvgPath(points: BodyMapPoint[], closed: boolean): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x * 200} ${first!.y * 360}`;
  for (const p of rest) {
    d += ` L ${p.x * 200} ${p.y * 360}`;
  }
  if (closed) d += " Z";
  return d;
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

/** Allowlist rebuild of anatomy SVG overlays (rejects scripts / handlers / href). */
export function sanitizeAnatomySvg(raw: string): string | null {
  return sanitizeAnatomySvgAllowlist(raw);
}

function parseCustomViewRow(row: unknown): BodyChartCustomView | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || !isBodyMapViewId(r.id) || isBuiltinView(r.id)) {
    return null;
  }
  if (typeof r.label !== "string" || !r.label.trim()) return null;
  if (typeof r.svg !== "string") return null;
  const svg = sanitizeAnatomySvg(r.svg);
  if (!svg) return null;
  return {
    id: r.id,
    label: r.label.trim().slice(0, 80),
    svg,
  };
}

export function parseBodyChartConfig(value: unknown): BodyChartConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { customViews: [] };
  }
  const raw = value as { customViews?: unknown; archivedViews?: unknown };
  const customViews: BodyChartCustomView[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.customViews)) {
    for (const row of raw.customViews) {
      const view = parseCustomViewRow(row);
      if (!view || seen.has(view.id)) continue;
      seen.add(view.id);
      customViews.push(view);
      if (customViews.length >= 12) break;
    }
  }
  const archivedViews: BodyChartCustomView[] = [];
  if (Array.isArray(raw.archivedViews)) {
    for (const row of raw.archivedViews) {
      const view = parseCustomViewRow(row);
      if (!view || seen.has(view.id)) continue;
      seen.add(view.id);
      archivedViews.push(view);
      if (archivedViews.length >= MAX_ARCHIVED_CUSTOM_VIEWS) break;
    }
  }
  return archivedViews.length
    ? { customViews, archivedViews }
    : { customViews };
}

/** Active + archived custom views (archived last) for mark rendering / print. */
export function allCustomViews(config: BodyChartConfig): BodyChartCustomView[] {
  return [...config.customViews, ...(config.archivedViews ?? [])];
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
