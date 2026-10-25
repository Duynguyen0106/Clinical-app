"use client";

import {
  BODY_MAP_VIEWS,
  isBuiltinView,
  markSummary,
  pointsToSvgPath,
  viewLabel,
  type BodyChartCustomView,
  type BodyMapContent,
  type BodyMapMarkKind,
  type BodyMapViewId,
} from "@/modules/notes/body-map";
import { AnatomySilhouette } from "./AnatomyViews";

const MARK_COLOUR: Record<BodyMapMarkKind, string> = {
  pain: "#c45c26",
  lesion: "#2f6fed",
  somatic_dysfunction: "#0f7a5a",
};

type Props = {
  map: BodyMapContent;
  customViews?: BodyChartCustomView[];
};

/** Static print-friendly figures for each view that has marks. */
export function BodyMapPrintFigure({ map, customViews = [] }: Props) {
  const known = new Set<string>([
    ...BODY_MAP_VIEWS,
    ...customViews.map((v) => v.id),
  ]);
  const views: BodyMapViewId[] = [];
  for (const m of map.marks) {
    if (!views.includes(m.view)) views.push(m.view);
  }
  // Prefer builtin order, then customs, then orphans
  views.sort((a, b) => {
    const ai = BODY_MAP_VIEWS.indexOf(a as (typeof BODY_MAP_VIEWS)[number]);
    const bi = BODY_MAP_VIEWS.indexOf(b as (typeof BODY_MAP_VIEWS)[number]);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return String(a).localeCompare(String(b));
  });
  if (views.length === 0) return null;

  return (
    <div className="body-map-print">
      <div className="body-map-print-grid">
        {views.map((view) => (
          <PrintView
            key={view}
            view={view}
            map={map}
            customViews={customViews}
            orphan={!known.has(view) && !isBuiltinView(view)}
          />
        ))}
      </div>
    </div>
  );
}

function PrintView({
  view,
  map,
  customViews,
  orphan,
}: {
  view: BodyMapViewId;
  map: BodyMapContent;
  customViews: BodyChartCustomView[];
  orphan: boolean;
}) {
  const marks = map.marks.filter((m) => m.view === view);
  const customSvg = customViews.find((v) => v.id === view)?.svg;
  return (
    <figure className="body-map-print-view">
      <figcaption>
        {viewLabel(view, customViews)}
        {orphan ? " (removed)" : ""} ({marks.length})
      </figcaption>
      <svg viewBox="0 0 200 360" className="body-map-print-svg" aria-hidden>
        <rect width="200" height="360" fill="#f6f3ee" rx="8" />
        <AnatomySilhouette
          view={view}
          customSvg={customSvg}
          orphan={orphan}
        />
        {marks.map((m, i) => {
          const colour = MARK_COLOUR[m.kind];
          const shape = m.shape ?? "point";
          return (
            <g key={m.id}>
              {shape !== "point" && m.points?.length ? (
                <path
                  d={pointsToSvgPath(m.points, shape === "polygon")}
                  fill={shape === "polygon" ? `${colour}33` : "none"}
                  stroke={colour}
                  strokeWidth={2}
                />
              ) : null}
              <g transform={`translate(${m.x * 200} ${m.y * 360})`}>
                <circle r={7} fill={colour} stroke="#fff" strokeWidth={1.5} />
                <text
                  y={3.5}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#fff"
                  fontWeight="700"
                >
                  {i + 1}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <ul className="body-map-print-legend">
        {marks.map((m, i) => (
          <li key={m.id}>
            {i + 1}. {markSummary(m, customViews)}
          </li>
        ))}
      </ul>
    </figure>
  );
}
