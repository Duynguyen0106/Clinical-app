"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BODY_MAP_MARK_KINDS,
  BODY_MAP_VIEWS,
  LESION_TYPES,
  SOMATIC_FINDINGS,
  BODY_SIDES,
  MAX_BODY_MAP_MARKS,
  MAX_MARK_POINTS,
  centroid,
  emptyBodyMap,
  isBuiltinView,
  kindLabel,
  markSummary,
  newMarkId,
  pointsToSvgPath,
  viewLabel,
  type BodyChartCustomView,
  type BodyMapContent,
  type BodyMapMark,
  type BodyMapMarkKind,
  type BodyMapPoint,
  type BodyMapShape,
  type BodyMapViewId,
  type LesionType,
  type SomaticFinding,
  type BodySide,
} from "@/modules/notes/body-map";
import { AnatomySilhouette } from "./AnatomyViews";

type DrawMode = "point" | "path" | "polygon";

type Props = {
  value: BodyMapContent;
  onChange: (next: BodyMapContent) => void;
  readOnly?: boolean;
  /** Active clinic overlays — shown in the view picker. */
  customViews?: BodyChartCustomView[];
  /** Soft-deleted overlays — render-only; tab appears only if marks use them. */
  archivedViews?: BodyChartCustomView[];
};

const MARK_COLOUR: Record<BodyMapMarkKind, string> = {
  pain: "#c45c26",
  lesion: "#2f6fed",
  somatic_dysfunction: "#0f7a5a",
};

export function BodyMapEditor({
  value,
  onChange,
  readOnly,
  customViews = [],
  archivedViews = [],
}: Props) {
  const uid = useId();
  const map = value?.version === 1 ? value : emptyBodyMap();
  const marksRef = useRef(map.marks);
  const activeViewRef = useRef(map.activeView);
  useEffect(() => {
    marksRef.current = map.marks;
    activeViewRef.current = map.activeView;
  }, [map.marks, map.activeView]);

  const [tool, setTool] = useState<BodyMapMarkKind>("pain");
  const [drawMode, setDrawMode] = useState<DrawMode>("point");
  const [intensity, setIntensity] = useState(5);
  const [lesionType, setLesionType] = useState<LesionType>("bruise");
  const [dysfunction, setDysfunction] = useState<SomaticFinding>("TART");
  const [region, setRegion] = useState("");
  const [side, setSide] = useState<BodySide>("midline");
  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<BodyMapPoint[]>([]);
  const draftPointsRef = useRef<BodyMapPoint[]>([]);
  const drawingRef = useRef(false);
  /** Capture attrs at stroke start so mid-draw tool changes don't mutate the mark. */
  const strokeToolRef = useRef<{
    kind: BodyMapMarkKind;
    intensity: number;
    lesionType: LesionType;
    dysfunction: SomaticFinding;
    region: string;
    side: BodySide;
    note: string;
  } | null>(null);

  function setDraft(next: BodyMapPoint[]) {
    draftPointsRef.current = next;
    setDraftPoints(next);
  }

  const renderViews = useMemo(() => {
    const byId = new Map<string, BodyChartCustomView>();
    for (const v of archivedViews) byId.set(v.id, v);
    for (const v of customViews) byId.set(v.id, v);
    for (const v of map.viewSnapshots ?? []) byId.set(v.id, v); // frozen wins
    return [...byId.values()];
  }, [archivedViews, customViews, map.viewSnapshots]);

  const archivedIds = useMemo(
    () => new Set(archivedViews.map((v) => v.id)),
    [archivedViews],
  );

  const orphanViewIds = useMemo(() => {
    const known = new Set<string>([
      ...BODY_MAP_VIEWS,
      ...renderViews.map((v) => v.id),
    ]);
    const orphans = new Set<string>();
    for (const m of map.marks) {
      if (!isBuiltinView(m.view) && !known.has(m.view)) orphans.add(m.view);
    }
    return orphans;
  }, [map.marks, renderViews]);

  const allViews: BodyMapViewId[] = useMemo(() => {
    // Picker: builtins + active customs only. Archived/orphan tabs only if marks use them.
    const base: BodyMapViewId[] = [
      ...BODY_MAP_VIEWS,
      ...customViews.map((v) => v.id),
    ];
    const markedCustom = new Set(
      map.marks.map((m) => m.view).filter((v) => !isBuiltinView(v)),
    );
    for (const v of archivedViews) {
      if (markedCustom.has(v.id) && !base.includes(v.id)) base.push(v.id);
    }
    for (const id of orphanViewIds) {
      if (!base.includes(id)) base.push(id);
    }
    return base;
  }, [customViews, archivedViews, map.marks, orphanViewIds]);

  const viewMarks = useMemo(
    () => map.marks.filter((m) => m.view === map.activeView),
    [map.marks, map.activeView],
  );

  const activeIsOrphan = orphanViewIds.has(map.activeView);
  const viewOnlyAnatomy =
    activeIsOrphan ||
    (archivedIds.has(map.activeView) &&
      !customViews.some((v) => v.id === map.activeView));
  const drawLocked = Boolean(readOnly || viewOnlyAnatomy);
  /** Archived/orphan: no draw and no mark remove/clear. */
  const marksLocked = drawLocked;

  function emit(next: BodyMapContent) {
    onChange({
      ...next,
      ...(map.viewSnapshots?.length
        ? { viewSnapshots: map.viewSnapshots }
        : {}),
    });
  }

  function setView(activeView: BodyMapViewId) {
    setDraft([]);
    drawingRef.current = false;
    strokeToolRef.current = null;
    emit({
      version: 1,
      activeView,
      marks: marksRef.current,
    });
  }

  function captureStrokeTool() {
    strokeToolRef.current = {
      kind: tool,
      intensity,
      lesionType,
      dysfunction,
      region,
      side,
      note,
    };
  }

  function attrsForStroke(): Partial<BodyMapMark> {
    const t = strokeToolRef.current;
    if (!t) return {};
    const base: Partial<BodyMapMark> = {
      side: t.side,
      note: t.note.trim() || undefined,
    };
    if (t.kind === "pain") base.intensity = t.intensity;
    if (t.kind === "lesion") base.lesionType = t.lesionType;
    if (t.kind === "somatic_dysfunction") {
      base.dysfunction = t.dysfunction;
      base.region = t.region.trim() || undefined;
    }
    return base;
  }

  function commitMark(shape: BodyMapShape, points: BodyMapPoint[], x: number, y: number) {
    if (drawLocked) return;
    if (marksRef.current.length >= MAX_BODY_MAP_MARKS) return;
    if (!strokeToolRef.current) captureStrokeTool();
    const kind = strokeToolRef.current?.kind ?? tool;
    const mark: BodyMapMark = {
      id: newMarkId(),
      kind,
      view: activeViewRef.current,
      x,
      y,
      shape,
      createdAt: new Date().toISOString(),
      ...attrsForStroke(),
    };
    if (points.length) mark.points = points;
    const nextMarks = [...marksRef.current, mark];
    marksRef.current = nextMarks;
    emit({
      version: 1,
      activeView: activeViewRef.current,
      marks: nextMarks,
    });
    setSelectedId(mark.id);
    setNote("");
    setDraft([]);
    drawingRef.current = false;
    strokeToolRef.current = null;
  }

  function svgPoint(e: React.PointerEvent<SVGSVGElement>): BodyMapPoint | null {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.min(1, Math.max(0, loc.x / 200)),
      y: Math.min(1, Math.max(0, loc.y / 360)),
    };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (drawLocked) return;
    if (e.button != null && e.button !== 0) return;
    const p = svgPoint(e);
    if (!p) return;

    if (drawMode === "point") {
      captureStrokeTool();
      commitMark("point", [], p.x, p.y);
      return;
    }

    if (drawMode === "path") {
      captureStrokeTool();
      drawingRef.current = true;
      setDraft([p]);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // polygon: accumulate clicks; double-click finishes
    if (e.detail >= 2 && draftPointsRef.current.length >= 3) {
      const pts = draftPointsRef.current.slice(0, MAX_MARK_POINTS);
      const c = centroid(pts);
      commitMark("polygon", pts, c.x, c.y);
      return;
    }
    if (draftPointsRef.current.length === 0) captureStrokeTool();
    const next =
      draftPointsRef.current.length >= MAX_MARK_POINTS
        ? draftPointsRef.current
        : [...draftPointsRef.current, p];
    setDraft(next);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current || drawMode !== "path" || drawLocked) return;
    const p = svgPoint(e);
    if (!p) return;
    const pts = draftPointsRef.current;
    if (pts.length >= MAX_MARK_POINTS) return;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.008) return;
    setDraft([...pts, p]);
  }

  function onPointerUp() {
    if (!drawingRef.current || drawMode !== "path") return;
    drawingRef.current = false;
    const pts = draftPointsRef.current;
    if (pts.length >= 2) {
      const c = centroid(pts);
      commitMark("path", pts, c.x, c.y);
    } else {
      setDraft([]);
    }
  }

  function finishPolygon() {
    if (draftPointsRef.current.length < 3) return;
    const pts = draftPointsRef.current;
    const c = centroid(pts);
    commitMark("polygon", pts, c.x, c.y);
  }

  function removeMark(id: string) {
    if (marksLocked) return;
    const nextMarks = marksRef.current.filter((m) => m.id !== id);
    marksRef.current = nextMarks;
    emit({
      version: 1,
      activeView: activeViewRef.current,
      marks: nextMarks,
    });
    if (selectedId === id) setSelectedId(null);
  }

  function clearView() {
    if (marksLocked) return;
    if (
      viewMarks.length > 0 &&
      !window.confirm(`Clear ${viewMarks.length} mark(s) on this view?`)
    ) {
      return;
    }
    setDraft([]);
    strokeToolRef.current = null;
    const nextMarks = marksRef.current.filter(
      (m) => m.view !== activeViewRef.current,
    );
    marksRef.current = nextMarks;
    emit({
      version: 1,
      activeView: activeViewRef.current,
      marks: nextMarks,
    });
  }

  const customSvg = renderViews.find((v) => v.id === map.activeView)?.svg;
  const activeIsArchived =
    archivedIds.has(map.activeView) &&
    !customViews.some((v) => v.id === map.activeView);

  return (
    <div className="body-map">
      <div className="body-map-toolbar" role="toolbar" aria-label="Body chart tools">
        <div className="body-map-views" role="tablist" aria-label="Anatomy views">
          {allViews.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={map.activeView === v}
              className={
                map.activeView === v ? "btn-sm btn-secondary" : "btn-sm btn-ghost"
              }
              onClick={() => setView(v)}
            >
              {viewLabel(v, renderViews)}
              {orphanViewIds.has(v)
                ? " (removed)"
                : archivedIds.has(v) && !customViews.some((c) => c.id === v)
                  ? " (archived)"
                  : ""}
            </button>
          ))}
        </div>

        {!drawLocked ? (
          <>
            <div className="body-map-tools">
              {BODY_MAP_MARK_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={tool === k ? "btn-sm btn-secondary" : "btn-sm btn-ghost"}
                  onClick={() => setTool(k)}
                  style={
                    tool === k
                      ? { borderColor: MARK_COLOUR[k], color: MARK_COLOUR[k] }
                      : undefined
                  }
                >
                  {kindLabel(k)}
                </button>
              ))}
            </div>
            <div className="body-map-tools" role="group" aria-label="Draw mode">
              {(
                [
                  ["point", "Point"],
                  ["path", "Freehand"],
                  ["polygon", "Region"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={
                    drawMode === mode ? "btn-sm btn-secondary" : "btn-sm btn-ghost"
                  }
                  onClick={() => {
                    setDrawMode(mode);
                    setDraft([]);
                    drawingRef.current = false;
                  }}
                >
                  {label}
                </button>
              ))}
              {drawMode === "polygon" && draftPoints.length >= 3 ? (
                <button
                  type="button"
                  className="btn-sm btn-primary"
                  onClick={finishPolygon}
                >
                  Close region ({draftPoints.length})
                </button>
              ) : null}
              {drawMode === "polygon" && draftPoints.length > 0 ? (
                <button
                  type="button"
                  className="btn-sm btn-ghost"
                  onClick={() => setDraft([])}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {!drawLocked ? (
          <div className="body-map-attrs">
            {tool === "pain" ? (
              <label className="body-map-attr">
                <span>NRS</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  aria-valuetext={`${intensity} of 10`}
                />
                <strong>{intensity}</strong>
              </label>
            ) : null}
            {tool === "lesion" ? (
              <label className="body-map-attr">
                <span>Type</span>
                <select
                  value={lesionType}
                  onChange={(e) => setLesionType(e.target.value as LesionType)}
                >
                  {LESION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tool === "somatic_dysfunction" ? (
              <>
                <label className="body-map-attr">
                  <span>Finding</span>
                  <select
                    value={dysfunction}
                    onChange={(e) =>
                      setDysfunction(e.target.value as SomaticFinding)
                    }
                  >
                    {SOMATIC_FINDINGS.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="body-map-attr">
                  <span>Region</span>
                  <input
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g. L4–L5"
                  />
                </label>
              </>
            ) : null}
            <label className="body-map-attr">
              <span>Side</span>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as BodySide)}
              >
                {BODY_SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="body-map-attr body-map-attr-grow">
              <span>Note</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional detail before placing"
              />
            </label>
          </div>
        ) : null}
        {!drawLocked && drawMode !== "point" ? (
          <p className="muted body-map-hint">
            {drawMode === "path"
              ? "Press and drag to draw freehand."
              : "Click to add vertices · double-click or Close region to finish."}
          </p>
        ) : null}
      </div>

      <div className="body-map-stage">
        <svg
          viewBox="0 0 200 360"
          className="body-map-svg"
          role="img"
          aria-labelledby={`${uid}-title`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: drawLocked ? "default" : "crosshair" }}
        >
          <title id={`${uid}-title`}>
            {viewLabel(map.activeView, renderViews)} body chart
          </title>
          <rect width="200" height="360" fill="var(--body-map-bg, #f6f3ee)" rx="12" />
          <AnatomySilhouette
            view={map.activeView}
            customSvg={customSvg}
            orphan={activeIsOrphan}
            className="body-map-silhouette"
          />
          {marksRef.current.length >= MAX_BODY_MAP_MARKS ? (
            <text
              x="100"
              y="20"
              textAnchor="middle"
              fontSize="10"
              fill="#a33"
              stroke="none"
            >
              Mark limit reached
            </text>
          ) : null}
          {viewMarks.map((m, i) => (
            <MarkGraphic
              key={m.id}
              mark={m}
              index={i}
              selected={selectedId === m.id}
              onSelect={() => setSelectedId(m.id)}
            />
          ))}
          {draftPoints.length > 0 ? (
            <path
              d={pointsToSvgPath(draftPoints, drawMode === "polygon")}
              fill={
                drawMode === "polygon"
                  ? "rgba(15, 122, 90, 0.18)"
                  : "none"
              }
              stroke="#0f7a5a"
              strokeWidth={2}
              strokeDasharray="4 3"
              style={{ pointerEvents: "none" }}
            />
          ) : null}
        </svg>

        <aside className="body-map-legend" aria-label="Marks on this view">
          <div className="body-map-legend-head">
            <h4>{viewLabel(map.activeView, renderViews)} marks</h4>
            {!marksLocked && viewMarks.length > 0 ? (
              <button type="button" className="btn-ghost btn-sm" onClick={clearView}>
                Clear view
              </button>
            ) : null}
          </div>
          {activeIsArchived ? (
            <p className="muted">Archived anatomy — view-only; restore in Settings to chart again.</p>
          ) : null}
          {viewMarks.length === 0 ? (
            <p className="muted">
              {drawLocked
                ? "No marks on this view."
                : "Place a point, freehand stroke, or region."}
            </p>
          ) : (
            <ul className="body-map-mark-list">
              {viewMarks.map((m, i) => (
                <li
                  key={m.id}
                  className={
                    selectedId === m.id
                      ? "body-map-mark-item is-selected"
                      : "body-map-mark-item"
                  }
                >
                  <button
                    type="button"
                    className="body-map-mark-select"
                    onClick={() => setSelectedId(m.id)}
                  >
                    <span
                      className="body-map-swatch"
                      style={{ background: MARK_COLOUR[m.kind] }}
                      aria-hidden
                    />
                    <span>
                      <strong>
                        {i + 1}. {kindLabel(m.kind)}
                      </strong>
                      <span className="muted">
                        {markSummary(m, renderViews)}
                      </span>
                    </span>
                  </button>
                  {!marksLocked ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => removeMark(m.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="muted body-map-count">
            {map.marks.length} mark{map.marks.length === 1 ? "" : "s"} across all
            views
          </p>
        </aside>
      </div>
    </div>
  );
}

function MarkGraphic({
  mark,
  index,
  selected,
  onSelect,
}: {
  mark: BodyMapMark;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const colour = MARK_COLOUR[mark.kind];
  const shape = mark.shape ?? "point";
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ cursor: "pointer" }}
    >
      {shape !== "point" && mark.points?.length ? (
        <path
          d={pointsToSvgPath(mark.points, shape === "polygon")}
          fill={shape === "polygon" ? `${colour}33` : "none"}
          stroke={colour}
          strokeWidth={selected ? 3 : 2}
        />
      ) : null}
      <g transform={`translate(${mark.x * 200} ${mark.y * 360})`}>
        <circle
          r={selected ? 12 : 10}
          fill={colour}
          opacity={0.95}
          stroke="#fff"
          strokeWidth={2}
        />
        <text
          y={4}
          textAnchor="middle"
          fontSize="10"
          fill="#fff"
          fontWeight="700"
          style={{ pointerEvents: "none" }}
        >
          {index + 1}
        </text>
      </g>
    </g>
  );
}
