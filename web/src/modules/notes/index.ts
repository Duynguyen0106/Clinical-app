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
  emptyBodyMap,
  parseBodyMap,
  markSummary,
  bodyMapPrintLines,
} from "./body-map";
export type {
  BodyMapContent,
  BodyMapMark,
  BodyMapMarkKind,
  BodyMapViewId,
} from "./body-map";
