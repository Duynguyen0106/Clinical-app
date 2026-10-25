"use client";

import {
  BODY_MAP_VIEWS,
  kindLabel,
  viewLabel,
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
};

/** Static print-friendly figures for each view that has marks. */
export function BodyMapPrintFigure({ map }: Props) {
  const views = BODY_MAP_VIEWS.filter((v) =>
    map.marks.some((m) => m.view === v),
  );
  if (views.length === 0) return null;

  return (
    <div className="body-map-print">
      <div className="body-map-print-grid">
        {views.map((view) => (
          <PrintView key={view} view={view} map={map} />
        ))}
      </div>
    </div>
  );
}

function PrintView({
  view,
  map,
}: {
  view: BodyMapViewId;
  map: BodyMapContent;
}) {
  const marks = map.marks.filter((m) => m.view === view);
  return (
    <figure className="body-map-print-view">
      <figcaption>
        {viewLabel(view)} ({marks.length})
      </figcaption>
      <svg viewBox="0 0 200 360" className="body-map-print-svg" aria-hidden>
        <rect width="200" height="360" fill="#f6f3ee" rx="8" />
        <AnatomySilhouette view={view} />
        {marks.map((m, i) => (
          <g key={m.id} transform={`translate(${m.x * 200} ${m.y * 360})`}>
            <circle
              r={7}
              fill={MARK_COLOUR[m.kind]}
              stroke="#fff"
              strokeWidth={1.5}
            />
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
        ))}
      </svg>
      <ul className="body-map-print-legend">
        {marks.map((m, i) => (
          <li key={m.id}>
            {i + 1}. {kindLabel(m.kind)}
            {m.kind === "pain" && m.intensity != null
              ? ` NRS ${m.intensity}`
              : ""}
            {m.region ? ` · ${m.region}` : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}
