"use client";

import { createElement, useMemo, type ReactNode } from "react";
import {
  isBuiltinView,
  sanitizeAnatomySvg,
  type BodyMapViewId,
} from "@/modules/notes/body-map";
import {
  parseSanitizedSvgInner,
  type SanitizedSvgNode,
} from "@/modules/notes/svg-allowlist";

type Props = {
  view: BodyMapViewId;
  className?: string;
  /** Sanitised custom SVG markup for clinic overlays */
  customSvg?: string;
  /** When custom view was deleted but marks remain */
  orphan?: boolean;
};

/** Stylised MSK silhouettes — click targets live in the parent SVG overlay. */
export function AnatomySilhouette({
  view,
  className,
  customSvg,
  orphan,
}: Props) {
  if (orphan) {
    return <OrphanPlaceholder className={className} />;
  }
  if (!isBuiltinView(view) && customSvg) {
    return <CustomOverlay svg={customSvg} className={className} />;
  }
  if (!isBuiltinView(view)) {
    return <OrphanPlaceholder className={className} />;
  }
  switch (view) {
    case "anterior":
      return <Anterior className={className} />;
    case "posterior":
      return <Posterior className={className} />;
    case "left_lateral":
      return <Lateral side="left" className={className} />;
    case "right_lateral":
      return <Lateral side="right" className={className} />;
    case "spine":
      return <Spine className={className} />;
    case "cervical":
      return <Cervical className={className} />;
    case "plantar":
      return <Plantar className={className} />;
    default:
      return <Posterior className={className} />;
  }
}

function OrphanPlaceholder({ className }: { className?: string }) {
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="24" y="40" width="152" height="280" rx="12" opacity="0.35" />
      <text
        x="100"
        y="180"
        textAnchor="middle"
        fontSize="11"
        fill="currentColor"
        stroke="none"
        opacity="0.55"
      >
        Custom view removed
      </text>
    </g>
  );
}

/**
 * Render allowlisted SVG children as React elements (no raw HTML injection).
 * Re-sanitises on the client as defense in depth.
 */
function CustomOverlay({
  svg,
  className,
}: {
  svg: string;
  className?: string;
}) {
  const nodes = useMemo(() => {
    const safe = sanitizeAnatomySvg(svg);
    if (!safe) return null;
    return svgToReactNodes(safe);
  }, [svg]);
  if (!nodes) return <OrphanPlaceholder className={className} />;
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth="2">
      {nodes}
    </g>
  );
}

/**
 * Convert allowlist output to React nodes via the shared parser so attrs
 * like x1/y1 and forced self-closing shapes stay in lockstep with sanitize.
 */
function svgToReactNodes(svg: string): ReactNode[] | null {
  const tree = parseSanitizedSvgInner(svg);
  if (!tree) return null;
  let key = 0;
  const walk = (nodes: SanitizedSvgNode[]): ReactNode[] =>
    nodes.map((n) => {
      const kids = n.children.length ? walk(n.children) : null;
      return createEl(n.tag, n.attrs, kids, key++);
    });
  return walk(tree);
}

function createEl(
  tag: string,
  attrs: Record<string, string>,
  children: ReactNode[] | null,
  key: number,
): ReactNode {
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") props.className = v;
    else if (k === "stroke-width") props.strokeWidth = v;
    else if (k === "stroke-linecap") props.strokeLinecap = v;
    else if (k === "stroke-linejoin") props.strokeLinejoin = v;
    else if (k === "stroke-dasharray") props.strokeDasharray = v;
    else if (k === "fill-opacity") props.fillOpacity = v;
    else if (k === "stroke-opacity") props.strokeOpacity = v;
    else if (k === "fill-rule") props.fillRule = v;
    else if (k === "clip-rule") props.clipRule = v;
    else if (k === "viewbox") props.viewBox = v;
    else props[k] = v;
  }
  if (children && children.length) {
    return createElement(tag, props, ...children);
  }
  return createElement(tag, props);
}

function Anterior({ className }: { className?: string }) {
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="100" cy="28" rx="16" ry="20" />
      <path d="M100 48 v10" />
      <path d="M68 68 C72 58 84 55 100 55 C116 55 128 58 132 68 L138 140 C140 155 132 165 118 168 L100 172 L82 168 C68 165 60 155 62 140 Z" />
      <path d="M68 78 L42 118 L36 168" />
      <path d="M132 78 L158 118 L164 168" />
      <path d="M82 168 L78 250 L72 320" />
      <path d="M118 168 L122 250 L128 320" />
      <path d="M72 320 L58 340" />
      <path d="M128 320 L142 340" />
      <circle cx="88" cy="95" r="3" fill="currentColor" opacity="0.25" />
      <circle cx="112" cy="95" r="3" fill="currentColor" opacity="0.25" />
    </g>
  );
}

function Posterior({ className }: { className?: string }) {
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="100" cy="28" rx="16" ry="20" />
      <path d="M100 48 v10" />
      <path d="M68 68 C72 58 84 55 100 55 C116 55 128 58 132 68 L138 140 C140 155 132 165 118 168 L100 172 L82 168 C68 165 60 155 62 140 Z" />
      <path d="M68 78 L42 118 L36 168" />
      <path d="M132 78 L158 118 L164 168" />
      <path d="M82 168 L78 250 L72 320" />
      <path d="M118 168 L122 250 L128 320" />
      <path d="M72 320 L58 340" />
      <path d="M128 320 L142 340" />
      <path d="M100 58 L100 168" strokeDasharray="3 3" opacity="0.5" />
      <path d="M100 168 L100 250" strokeDasharray="3 3" opacity="0.45" />
    </g>
  );
}

function Lateral({
  side,
  className,
}: {
  side: "left" | "right";
  className?: string;
}) {
  const flip = side === "right" ? "scale(-1,1) translate(-200,0)" : undefined;
  return (
    <g
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      transform={flip}
    >
      <ellipse cx="110" cy="30" rx="14" ry="18" />
      <path d="M110 48 v8" />
      <path d="M95 60 C100 55 110 54 120 58 L135 130 C138 150 130 165 115 170 L100 250 L95 320 L85 340" />
      <path d="M100 78 L70 120 L65 160" />
      <path d="M115 170 L130 250 L140 320" opacity="0.55" />
      <path d="M108 70 C118 90 122 120 118 150" strokeDasharray="2 3" opacity="0.4" />
    </g>
  );
}

function Spine({ className }: { className?: string }) {
  const levels = [
    "C1",
    "C4",
    "C7",
    "T1",
    "T4",
    "T7",
    "T10",
    "T12",
    "L1",
    "L3",
    "L5",
    "S1",
  ];
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M100 24 C108 40 110 55 108 70 C106 110 104 150 102 190 C100 230 98 260 96 290 C94 310 92 325 88 340" />
      <path d="M100 24 C92 40 90 55 92 70 C94 110 96 150 98 190 C100 230 102 260 104 290 C106 310 108 325 112 340" />
      {levels.map((label, i) => {
        const y = 36 + i * 24;
        return (
          <g key={label}>
            <line x1="78" y1={y} x2="122" y2={y} opacity="0.35" />
            <text
              x="58"
              y={y + 4}
              fontSize="10"
              fill="currentColor"
              stroke="none"
              opacity="0.55"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Cervical({ className }: { className?: string }) {
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="100" cy="70" rx="36" ry="44" />
      <path d="M100 114 v40" />
      <path d="M70 140 C78 160 90 175 100 178 C110 175 122 160 130 140" />
      <path d="M78 90 L55 120" />
      <path d="M122 90 L145 120" />
      {["C1", "C2", "C3", "C4", "C5", "C6", "C7"].map((label, i) => {
        const y = 130 + i * 14;
        return (
          <g key={label}>
            <line x1="88" y1={y} x2="112" y2={y} opacity="0.4" />
            <text
              x="118"
              y={y + 3}
              fontSize="9"
              fill="currentColor"
              stroke="none"
              opacity="0.55"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Plantar({ className }: { className?: string }) {
  return (
    <g className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="70" cy="180" rx="28" ry="70" />
      <ellipse cx="130" cy="180" rx="28" ry="70" />
      <path d="M55 130 C50 100 55 70 70 55 C85 70 90 100 85 130" opacity="0.5" />
      <path d="M115 130 C110 100 115 70 130 55 C145 70 150 100 145 130" opacity="0.5" />
      <text x="58" y="280" fontSize="11" fill="currentColor" stroke="none" opacity="0.5">
        L
      </text>
      <text x="122" y="280" fontSize="11" fill="currentColor" stroke="none" opacity="0.5">
        R
      </text>
    </g>
  );
}
