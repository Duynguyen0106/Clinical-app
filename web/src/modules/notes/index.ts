/** Clinical notes — templates, draft/sign, audit, body charts. */

export { MSK_TEMPLATE_PACK, parseTemplateSections } from "./templates";
export type {
  NoteSection,
  NoteSectionType,
  NoteTemplateDef,
} from "./templates";
export {
  BODY_MAP_CONTENT_KEY,
  BODY_MAP_VIEWS,
  BODY_MAP_MARK_KINDS,
  BODY_MAP_SHAPES,
  allCustomViews,
  attachViewSnapshots,
  emptyBodyMap,
  parseBodyMap,
  parseBodyChartConfig,
  resolveCustomViewsForMap,
  sanitizeAnatomySvg,
  markSummary,
  bodyMapPrintLines,
} from "./body-map";
export type {
  BodyMapContent,
  BodyMapMark,
  BodyMapMarkKind,
  BodyMapShape,
  BodyMapViewId,
  BodyChartConfig,
  BodyChartCustomView,
} from "./body-map";
