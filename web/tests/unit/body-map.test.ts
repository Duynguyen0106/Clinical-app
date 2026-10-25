import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BODY_MAP_CONTENT_KEY,
  BODY_MAP_VIEWS,
  bodyMapPrintLines,
  emptyBodyMap,
  isBodyMapContent,
  markSummary,
  parseBodyMap,
  withBodyMap,
  type BodyMapMark,
} from "../../src/modules/notes/body-map";
import { mapSoapToTemplateSections } from "../../src/modules/ai/map-to-template";
import { MSK_TEMPLATE_PACK } from "../../src/modules/notes/templates";
import { flattenNoteSections } from "../../src/modules/notes/documents";
import type { SoapNoteContent } from "../../src/modules/ai/mock-pipeline";

describe("body map model", () => {
  it("exposes all anatomy views", () => {
    assert.deepEqual([...BODY_MAP_VIEWS], [
      "anterior",
      "posterior",
      "left_lateral",
      "right_lateral",
      "spine",
      "cervical",
      "plantar",
    ]);
  });

  it("parses and summarises pain, lesion, and somatic marks", () => {
    const pain: BodyMapMark = {
      id: "1",
      kind: "pain",
      view: "posterior",
      x: 0.5,
      y: 0.4,
      intensity: 7,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const lesion: BodyMapMark = {
      id: "2",
      kind: "lesion",
      view: "anterior",
      x: 0.3,
      y: 0.2,
      lesionType: "bruise",
      side: "left",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const somatic: BodyMapMark = {
      id: "3",
      kind: "somatic_dysfunction",
      view: "spine",
      x: 0.5,
      y: 0.6,
      region: "L4-L5",
      dysfunction: "TART",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const map = {
      version: 1 as const,
      activeView: "posterior" as const,
      marks: [pain, lesion, somatic],
    };
    assert.equal(isBodyMapContent(map), true);
    assert.match(markSummary(pain), /Pain/);
    assert.match(markSummary(pain), /NRS 7/);
    assert.match(markSummary(lesion), /bruise/);
    assert.match(markSummary(somatic), /L4-L5/);
    assert.equal(bodyMapPrintLines(map).length, 3);

    const content = withBodyMap({ subjective: "ok" }, map);
    assert.equal(parseBodyMap(content).marks.length, 3);
    const flat = flattenNoteSections(content);
    const chart = flat.find((s) => s.key === BODY_MAP_CONTENT_KEY);
    assert.ok(chart);
    assert.match(chart!.value, /somatic dysfunction/i);
  });

  it("seeds empty body_map when organising templates with a chart section", () => {
    const soap: SoapNoteContent = {
      subjective: "S",
      objective: "O",
      assessment: "A",
      plan: "P",
      clinician_review_flags: [],
    };
    const tpl = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_osteo_session")!;
    const out = mapSoapToTemplateSections(soap, tpl.sections);
    assert.ok(isBodyMapContent(out.body_map));
    assert.deepEqual(out.body_map, emptyBodyMap());
  });
});
