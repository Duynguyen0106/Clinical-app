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
  sanitizeBodyMap,
  sanitizeNoteContent,
  withBodyMap,
  type BodyMapMark,
} from "../../src/modules/notes/body-map";
import { mapSoapToTemplateSections } from "../../src/modules/ai/map-to-template";
import {
  MSK_TEMPLATE_PACK,
  parseTemplateSections,
} from "../../src/modules/notes/templates";
import { flattenNoteSections } from "../../src/modules/notes/documents";
import { noteTemplateUpsertSchema } from "../../src/modules/notes/service";
import { hashNoteContent } from "../../src/modules/notes/hash";
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

  it("sanitises invalid marks and clamps intensity/coords", () => {
    const dirty = {
      version: 1 as const,
      activeView: "posterior" as const,
      marks: [
        {
          id: "ok",
          kind: "pain",
          view: "posterior",
          x: 1.8,
          y: -0.2,
          intensity: 99,
          note: "x".repeat(500),
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        { id: "bad", kind: "pain", view: "nope", x: 0.5, y: 0.5 },
        "garbage",
      ],
    };
    const clean = sanitizeBodyMap(dirty);
    assert.equal(clean.marks.length, 1);
    assert.equal(clean.marks[0]!.x, 1);
    assert.equal(clean.marks[0]!.y, 0);
    assert.equal(clean.marks[0]!.intensity, 10);
    assert.ok((clean.marks[0]!.note?.length ?? 0) <= 400);
  });

  it("migrates misplaced body-map keys and preserves marks on empty reorganise", () => {
    const marks: BodyMapMark[] = [
      {
        id: "1",
        kind: "lesion",
        view: "anterior",
        x: 0.3,
        y: 0.2,
        lesionType: "bruise",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const existing = {
      subjective: "old",
      chart: { version: 1, activeView: "anterior", marks },
    };
    const incoming = {
      subjective: "new",
      [BODY_MAP_CONTENT_KEY]: emptyBodyMap(),
    };
    const merged = sanitizeNoteContent(incoming, {
      preserveBodyMapFrom: existing,
    });
    assert.equal(merged.subjective, "new");
    assert.equal((merged[BODY_MAP_CONTENT_KEY] as { marks: unknown[] }).marks.length, 1);
    assert.equal(merged.chart, undefined);

    const migrated = sanitizeNoteContent(existing as Record<string, unknown>);
    assert.ok(isBodyMapContent(migrated[BODY_MAP_CONTENT_KEY]));
    assert.equal(migrated.chart, undefined);
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

    const signed = sanitizeNoteContent(content);
    const hash = hashNoteContent(signed);
    assert.equal(hash.length, 64);
    assert.deepEqual(signed[BODY_MAP_CONTENT_KEY], sanitizeBodyMap(map));
  });

  it("seeds empty body_map under canonical key when organising", () => {
    const soap: SoapNoteContent = {
      subjective: "S",
      objective: "O",
      assessment: "A",
      plan: "P",
      clinician_review_flags: [],
    };
    const tpl = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_osteo_session")!;
    const out = mapSoapToTemplateSections(soap, [
      ...tpl.sections.filter((s) => s.type !== "body_map"),
      { id: "chart_custom", title: "Chart", type: "body_map" },
    ]);
    assert.ok(isBodyMapContent(out[BODY_MAP_CONTENT_KEY]));
    assert.equal(out.chart_custom, undefined);
    assert.deepEqual(out[BODY_MAP_CONTENT_KEY], emptyBodyMap());
  });

  it("locks body_map section id in template upsert schema", () => {
    const parsed = noteTemplateUpsertSchema.parse({
      name: "Custom osteo",
      sections: [
        { id: "presentation", title: "Presentation", type: "markdown" },
        { id: "my_chart", title: "Chart", type: "body_map" },
      ],
    });
    const chart = parsed.sections.find((s) => s.type === "body_map");
    assert.equal(chart?.id, BODY_MAP_CONTENT_KEY);

    assert.throws(() =>
      noteTemplateUpsertSchema.parse({
        name: "Bad",
        sections: [
          { id: "a", title: "A", type: "body_map" },
          { id: "b", title: "B", type: "body_map" },
        ],
      }),
    );

    const normalized = parseTemplateSections({
      sections: [{ id: "weird", title: "Chart", type: "body_map" }],
    });
    assert.equal(normalized[0]?.id, BODY_MAP_CONTENT_KEY);
  });
});
