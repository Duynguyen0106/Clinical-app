"use client";

import { useId, useMemo, useState } from "react";
import {
  BODY_MAP_MARK_KINDS,
  BODY_MAP_VIEWS,
  LESION_TYPES,
  SOMATIC_FINDINGS,
  BODY_SIDES,
  emptyBodyMap,
  kindLabel,
  markSummary,
  newMarkId,
  viewLabel,
  type BodyMapContent,
  type BodyMapMark,
  type BodyMapMarkKind,
  type BodyMapViewId,
  type LesionType,
  type SomaticFinding,
  type BodySide,
} from "@/modules/notes/body-map";
import { AnatomySilhouette } from "./AnatomyViews";

type Props = {
  value: BodyMapContent;
  onChange: (next: BodyMapContent) => void;
  readOnly?: boolean;
};

const MARK_COLOUR: Record<BodyMapMarkKind, string> = {
  pain: "#c45c26",
  lesion: "#2f6fed",
  somatic_dysfunction: "#0f7a5a",
};

export function BodyMapEditor({ value, onChange, readOnly }: Props) {
  const uid = useId();
  const map = value?.version === 1 ? value : emptyBodyMap();
  const [tool, setTool] = useState<BodyMapMarkKind>("pain");
  const [intensity, setIntensity] = useState(5);
  const [lesionType, setLesionType] = useState<LesionType>("bruise");
  const [dysfunction, setDysfunction] = useState<SomaticFinding>("TART");
  const [region, setRegion] = useState("");
  const [side, setSide] = useState<BodySide>("midline");
  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const viewMarks = useMemo(
    () => map.marks.filter((m) => m.view === map.activeView),
    [map.marks, map.activeView],
  );

  function setView(activeView: BodyMapViewId) {
    onChange({ ...map, activeView });
  }

  function placeMark(x: number, y: number) {
    if (readOnly) return;
    const mark: BodyMapMark = {
      id: newMarkId(),
      kind: tool,
      view: map.activeView,
      x,
      y,
      createdAt: new Date().toISOString(),
      side,
      note: note.trim() || undefined,
    };
    if (tool === "pain") mark.intensity = intensity;
    if (tool === "lesion") mark.lesionType = lesionType;
    if (tool === "somatic_dysfunction") {
      mark.dysfunction = dysfunction;
      mark.region = region.trim() || undefined;
    }
    onChange({ ...map, marks: [...map.marks, mark] });
    setSelectedId(mark.id);
    setNote("");
  }

  function onSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (readOnly) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    const x = Math.min(1, Math.max(0, loc.x / 200));
    const y = Math.min(1, Math.max(0, loc.y / 360));
    placeMark(x, y);
  }

  function removeMark(id: string) {
    if (readOnly) return;
    onChange({ ...map, marks: map.marks.filter((m) => m.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function clearView() {
    if (readOnly) return;
    onChange({
      ...map,
      marks: map.marks.filter((m) => m.view !== map.activeView),
    });
  }

  return (
    <div className="body-map">
      <div className="body-map-toolbar" role="toolbar" aria-label="Body chart tools">
        <div className="body-map-views" role="tablist" aria-label="Anatomy views">
          {BODY_MAP_VIEWS.map((v) => (
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
              {viewLabel(v)}
            </button>
          ))}
        </div>

        {!readOnly ? (
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
        ) : null}

        {!readOnly ? (
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
      </div>

      <div className="body-map-stage">
        <svg
          viewBox="0 0 200 360"
          className="body-map-svg"
          role="img"
          aria-labelledby={`${uid}-title`}
          onClick={onSvgClick}
          style={{ cursor: readOnly ? "default" : "crosshair" }}
        >
          <title id={`${uid}-title`}>
            {viewLabel(map.activeView)} body chart
            {readOnly ? "" : " — click to place a mark"}
          </title>
          <rect width="200" height="360" fill="var(--body-map-bg, #f6f3ee)" rx="12" />
          <AnatomySilhouette view={map.activeView} className="body-map-silhouette" />
          {viewMarks.map((m, i) => (
            <g
              key={m.id}
              transform={`translate(${m.x * 200} ${m.y * 360})`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(m.id);
              }}
              style={{ cursor: "pointer" }}
            >
              <circle
                r={selectedId === m.id ? 9 : 7}
                fill={MARK_COLOUR[m.kind]}
                opacity={0.9}
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                y={4}
                textAnchor="middle"
                fontSize="9"
                fill="#fff"
                fontWeight="700"
                style={{ pointerEvents: "none" }}
              >
                {i + 1}
              </text>
            </g>
          ))}
        </svg>

        <aside className="body-map-legend" aria-label="Marks on this view">
          <div className="body-map-legend-head">
            <h4>{viewLabel(map.activeView)} marks</h4>
            {!readOnly && viewMarks.length > 0 ? (
              <button type="button" className="btn-ghost btn-sm" onClick={clearView}>
                Clear view
              </button>
            ) : null}
          </div>
          {viewMarks.length === 0 ? (
            <p className="muted">
              {readOnly
                ? "No marks on this view."
                : "Click the figure to place the selected finding."}
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
                      <span className="muted">{markSummary(m)}</span>
                    </span>
                  </button>
                  {!readOnly ? (
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
