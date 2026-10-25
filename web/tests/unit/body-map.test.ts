import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BODY_MAP_CONTENT_KEY,
  BODY_MAP_VIEWS,
  MAX_BODY_MAP_MARKS,
  allCustomViews,
  attachViewSnapshots,
  bodyMapPrintLines,
  emptyBodyMap,
  isBodyMapContent,
  markSummary,
  parseBodyChartConfig,
  parseBodyMap,
  resolveCustomViewsForMap,
  sanitizeAnatomySvg,
  sanitizeBodyMap,
  sanitizeNoteContent,
  withBodyMap,
  type BodyMapMark,
} from "../../src/modules/notes/body-map";
import {
  parseSanitizedSvgInner,
  sanitizedSvgRendersAsReact,
} from "../../src/modules/notes/svg-allowlist";
import { mapSoapToTemplateSections } from "../../src/modules/ai/map-to-template";
import {
  MSK_TEMPLATE_PACK,
  parseTemplateSections,
} from "../../src/modules/notes/templates";
import { flattenNoteSections } from "../../src/modules/notes/documents";
import {
  noteTemplateUpsertSchema,
  normalizeTemplateSchemaWithBodyMap,
} from "../../src/modules/notes/service";
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
    const printLines = bodyMapPrintLines(map);
    // Per-view headers + one line per mark (matches figure callout numbering)
    assert.equal(printLines.filter((l) => /^\s+\d+\./.test(l)).length, 3);
    assert.ok(printLines.some((l) => l.startsWith("Anterior:")));
    assert.ok(printLines.some((l) => l.startsWith("Posterior:")));
    assert.ok(printLines.some((l) => /^\s+1\./.test(l)));

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

  it("accepts freehand path and polygon marks", () => {
    const pathMark = {
      id: "p1",
      kind: "pain" as const,
      view: "posterior",
      x: 0.5,
      y: 0.5,
      shape: "path" as const,
      points: [
        { x: 0.4, y: 0.4 },
        { x: 0.5, y: 0.45 },
        { x: 0.6, y: 0.5 },
      ],
      intensity: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const polyMark = {
      id: "p2",
      kind: "lesion" as const,
      view: "anterior",
      x: 0.5,
      y: 0.5,
      shape: "polygon" as const,
      points: [
        { x: 0.3, y: 0.3 },
        { x: 0.5, y: 0.3 },
        { x: 0.4, y: 0.5 },
      ],
      lesionType: "swelling" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const clean = sanitizeBodyMap({
      version: 1,
      activeView: "posterior",
      marks: [pathMark, polyMark],
    });
    assert.equal(clean.marks.length, 2);
    assert.equal(clean.marks[0]!.shape, "path");
    assert.equal(clean.marks[0]!.points?.length, 3);
    assert.equal(clean.marks[1]!.shape, "polygon");
    assert.match(markSummary(clean.marks[0]!), /path/);
  });

  it("sanitises custom anatomy SVG with allowlist (XSS corpus)", () => {
    const ok = sanitizeAnatomySvg(
      '<svg viewBox="0 0 200 360"><path d="M10 10 L20 20"/></svg>',
    );
    assert.ok(ok);
    assert.match(ok!, /<path /);

    const rejects = [
      '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
      '<svg viewBox="0 0 1 1"><circle cx="1" cy="1" r="1" onfocus="alert(1)"/></svg>',
      '<svg viewBox="0 0 1 1"><rect width="1" height="1" onpointerdown="x"/></svg>',
      "<svg viewBox=\"0 0 1 1\">&#60;script&#62;x&#60;/script&#62;</svg>",
      '<svg viewBox="0 0 1 1"><html:script xmlns:html="http://www.w3.org/1999/xhtml">x</html:script></svg>',
      '<svg viewBox="0 0 1 1"><g style="x"><path d="M0 0"/></g></svg>',
      '<svg viewBox="0 0 1 1"><style>@import url(x)</style></svg>',
      '<svg viewBox="0 0 1 1"><animate onbegin="alert(1)"/></svg>',
      '<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>',
      '<svg viewBox="0 0 1 1"><image href="x"/></svg>',
      '<svg viewBox="0 0 1 1"><foreignObject/></svg>',
    ];
    for (const svg of rejects) {
      assert.equal(sanitizeAnatomySvg(svg), null, svg.slice(0, 60));
    }

    const cfg = parseBodyChartConfig({
      customViews: [
        { id: "custom_tmj", label: "TMJ", svg: ok! },
        { id: "bad", label: "Nope", svg: "<div/>" },
      ],
    });
    assert.equal(cfg.customViews.length, 1);
    assert.equal(cfg.customViews[0]!.id, "custom_tmj");
  });

  it("allowlist output always parses for React (parity: digits + paired shapes)", () => {
    const samples = [
      '<svg viewBox="0 0 200 360"><path d="M10 10 L20 20"></path></svg>',
      '<svg viewBox="0 0 200 360"><line x1="10" y1="20" x2="30" y2="40"/></svg>',
      '<svg viewBox="0 0 200 360"><g><circle cx="50" cy="50" r="10"></circle><rect x="1" y="2" width="3" height="4"/></g></svg>',
      '<svg VIEWBOX="0 0 200 360"><polygon points="0,0 10,0 5,10"/></svg>',
    ];
    for (const raw of samples) {
      const safe = sanitizeAnatomySvg(raw);
      assert.ok(safe, `sanitise failed: ${raw.slice(0, 50)}`);
      assert.match(safe!, /<(path|line|circle|rect|polygon)\b[^>]*\/>/);
      assert.equal(sanitizedSvgRendersAsReact(safe!), true, safe!);
      const tree = parseSanitizedSvgInner(safe!);
      assert.ok(tree);
      assert.ok(tree!.length >= 1);
      // Digit attrs preserved on lines
      if (raw.includes("x1=")) {
        const line = tree!.find((n) => n.tag === "line");
        assert.ok(line);
        assert.equal(line!.attrs.x1, "10");
        assert.equal(line!.attrs.y2, "40");
      }
    }
  });

  it("React parser rejects non-allowlisted tags even if sanitize skipped", () => {
    const dangerous = [
      '<svg viewBox="0 0 1 1"><script/></svg>',
      '<svg viewBox="0 0 1 1"><iframe/></svg>',
      '<svg viewBox="0 0 1 1"><foreignObject/></svg>',
      '<svg viewBox="0 0 1 1"><image href="x"/></svg>',
      '<svg viewBox="0 0 1 1"><a href="javascript:x"><path d="M0 0"/></a></svg>',
    ];
    for (const svg of dangerous) {
      assert.equal(sanitizeAnatomySvg(svg), null, svg.slice(0, 40));
      assert.equal(parseSanitizedSvgInner(svg), null, svg.slice(0, 40));
    }
  });

  it("rejects named HTML entities in SVG input", () => {
    assert.equal(
      sanitizeAnatomySvg(
        '<svg viewBox="0 0 1 1"><path d="M0 0" fill="javascript&colon;alert(1)"/></svg>',
      ),
      null,
    );
    assert.equal(
      sanitizeAnatomySvg(
        '<svg viewBox="0 0 1 1"><path d="M0&nbsp;0"/></svg>',
      ),
      null,
    );
  });

  it("truncates over-cap marks instead of wiping the map", () => {
    const marks = Array.from({ length: MAX_BODY_MAP_MARKS + 5 }, (_, i) => ({
      id: `m${i}`,
      kind: "pain" as const,
      view: "posterior",
      x: 0.5,
      y: 0.5,
      intensity: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    const clean = sanitizeBodyMap({
      version: 1,
      activeView: "posterior",
      marks,
    });
    assert.equal(clean.marks.length, MAX_BODY_MAP_MARKS);
    assert.equal(clean.marks[0]!.id, "m0");
  });

  it("dedupes mark ids and archives soft-deleted custom views", () => {
    const clean = sanitizeBodyMap({
      version: 1,
      activeView: "posterior",
      marks: [
        {
          id: "dup",
          kind: "pain",
          view: "posterior",
          x: 0.1,
          y: 0.1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "dup",
          kind: "lesion",
          view: "anterior",
          x: 0.2,
          y: 0.2,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    assert.equal(clean.marks.length, 1);
    assert.equal(clean.marks[0]!.kind, "pain");

    const okSvg =
      '<svg viewBox="0 0 200 360"><path d="M10 10 L20 20"/></svg>';
    const safe = sanitizeAnatomySvg(okSvg)!;
    const cfg = parseBodyChartConfig({
      customViews: [{ id: "custom_live", label: "Live", svg: safe }],
      archivedViews: [{ id: "custom_old", label: "Old", svg: safe }],
    });
    assert.equal(cfg.customViews.length, 1);
    assert.equal(cfg.archivedViews?.length, 1);
    assert.equal(allCustomViews(cfg).length, 2);
  });

  it("freezes custom SVG snapshots onto the body map", () => {
    const safe = sanitizeAnatomySvg(
      '<svg viewBox="0 0 200 360"><path d="M10 10 L20 20"/></svg>',
    )!;
    const other = sanitizeAnatomySvg(
      '<svg viewBox="0 0 200 360"><circle cx="10" cy="10" r="5"/></svg>',
    )!;
    const map = sanitizeBodyMap({
      version: 1,
      activeView: "custom_tmj",
      marks: [
        {
          id: "1",
          kind: "pain",
          view: "custom_tmj",
          x: 0.5,
          y: 0.5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      viewSnapshots: [{ id: "custom_tmj", label: "TMJ", svg: safe }],
    });
    assert.equal(map.viewSnapshots?.length, 1);
    assert.match(map.viewSnapshots![0]!.svg, /path/);

    // Existing snapshot wins over a newer clinic SVG
    const attached = attachViewSnapshots(map, [
      { id: "custom_tmj", label: "TMJ v2", svg: other },
    ]);
    assert.match(attached.viewSnapshots![0]!.svg, /path/);
    assert.equal(
      resolveCustomViewsForMap(attached, [
        { id: "custom_tmj", label: "TMJ v2", svg: other },
      ])[0]!.svg,
      attached.viewSnapshots![0]!.svg,
    );

    // Prior note snapshots win over empty incoming (draft autosave freeze)
    const bare = sanitizeBodyMap({
      version: 1,
      activeView: "custom_tmj",
      marks: map.marks,
    });
    const seeded = attachViewSnapshots(
      bare,
      [{ id: "custom_tmj", label: "TMJ v2", svg: other }],
      [{ id: "custom_tmj", label: "TMJ", svg: safe }],
    );
    assert.match(seeded.viewSnapshots![0]!.svg, /path/);
  });

  it("truncates over-cap viewSnapshots instead of wiping marks", () => {
    const safe = sanitizeAnatomySvg(
      '<svg viewBox="0 0 200 360"><path d="M10 10 L20 20"/></svg>',
    )!;
    const snaps = Array.from({ length: 60 }, (_, i) => ({
      id: `custom_v${i}`,
      label: `V${i}`,
      svg: safe,
    }));
    const clean = sanitizeBodyMap({
      version: 1,
      activeView: "custom_v0",
      marks: [
        {
          id: "1",
          kind: "pain",
          view: "custom_v0",
          x: 0.5,
          y: 0.5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      viewSnapshots: snaps,
    });
    assert.equal(clean.marks.length, 1);
    assert.ok((clean.viewSnapshots?.length ?? 0) <= 48);
    assert.equal(clean.viewSnapshots![0]!.id, "custom_v0");
  });

  it("rejects reserved body_map id on non-chart template sections", () => {
    assert.throws(() =>
      noteTemplateUpsertSchema.parse({
        name: "Collision",
        sections: [
          { id: "body_map", title: "Notes", type: "markdown" },
          { id: "chart", title: "Chart", type: "body_map" },
        ],
      }),
    );
  });

  it("normalises template schemas: insert, dedupe, lock body_map id", () => {
    const inserted = normalizeTemplateSchemaWithBodyMap({
      sections: [
        { id: "subjective", title: "S", type: "markdown" },
        { id: "plan", title: "P", type: "markdown" },
      ],
    });
    assert.ok(inserted);
    assert.equal(
      inserted!.sections.filter(
        (s) => (s as { type?: string }).type === "body_map",
      ).length,
      1,
    );

    const deduped = normalizeTemplateSchemaWithBodyMap({
      sections: [
        { id: "chart_a", title: "A", type: "body_map" },
        { id: "objective", title: "O", type: "markdown" },
        { id: "chart_b", title: "B", type: "body_map" },
      ],
    });
    assert.ok(deduped);
    const charts = deduped!.sections.filter(
      (s) => (s as { type?: string }).type === "body_map",
    );
    assert.equal(charts.length, 1);
    assert.equal((charts[0] as { id: string }).id, BODY_MAP_CONTENT_KEY);

    assert.equal(
      normalizeTemplateSchemaWithBodyMap({
        sections: [
          { id: BODY_MAP_CONTENT_KEY, title: "Body chart", type: "body_map" },
          { id: "plan", title: "P", type: "markdown" },
        ],
      }),
      null,
    );
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
