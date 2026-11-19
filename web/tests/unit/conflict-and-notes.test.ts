import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  intervalsOverlap,
  withBuffers,
} from "../../src/modules/scheduling/conflict";
import { hashNoteContent } from "../../src/modules/notes/hash";
import {
  BODY_MAP_CONTENT_KEY,
  emptyBodyMap,
  sanitizeNoteContent,
} from "../../src/modules/notes/body-map";
import {
  emptyContentFromTemplateSchema,
  MSK_TEMPLATE_PACK,
} from "../../src/modules/notes/templates";

/** Mirrors createManualDraft idempotency: never wipe an existing draft with blanks. */
function resolveManualDraftAction(existing: {
  id: string;
  source: string;
  content: Record<string, unknown>;
} | null) {
  if (existing) {
    return { action: "reuse" as const, note: existing };
  }
  return {
    action: "create" as const,
    source: "manual" as const,
  };
}

describe("intervalsOverlap", () => {
  it("detects overlapping ranges", () => {
    const a0 = new Date("2026-08-16T10:00:00Z");
    const a1 = new Date("2026-08-16T10:30:00Z");
    const b0 = new Date("2026-08-16T10:15:00Z");
    const b1 = new Date("2026-08-16T10:45:00Z");
    assert.equal(intervalsOverlap(a0, a1, b0, b1), true);
  });

  it("allows adjacent ranges that only touch at an endpoint", () => {
    const a0 = new Date("2026-08-16T10:00:00Z");
    const a1 = new Date("2026-08-16T10:30:00Z");
    const b0 = new Date("2026-08-16T10:30:00Z");
    const b1 = new Date("2026-08-16T11:00:00Z");
    assert.equal(intervalsOverlap(a0, a1, b0, b1), false);
  });

  it("rejects inverted intervals", () => {
    assert.equal(
      intervalsOverlap(
        new Date("2026-08-16T11:00:00Z"),
        new Date("2026-08-16T10:00:00Z"),
        new Date("2026-08-16T10:00:00Z"),
        new Date("2026-08-16T12:00:00Z"),
      ),
      false,
    );
  });
});

describe("withBuffers", () => {
  it("expands the window by buffer minutes", () => {
    const starts = new Date("2026-08-16T10:00:00Z");
    const ends = new Date("2026-08-16T10:30:00Z");
    const { windowStart, windowEnd } = withBuffers(starts, ends, 5, 10);
    assert.equal(windowStart.toISOString(), "2026-08-16T09:55:00.000Z");
    assert.equal(windowEnd.toISOString(), "2026-08-16T10:40:00.000Z");
  });
});

describe("hashNoteContent", () => {
  it("is stable for the same content", () => {
    const a = hashNoteContent({ subjective: "ok", plan: "review" });
    const b = hashNoteContent({ subjective: "ok", plan: "review" });
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it("changes when content changes", () => {
    const a = hashNoteContent({ subjective: "ok" });
    const b = hashNoteContent({ subjective: "changed" });
    assert.notEqual(a, b);
  });
});

describe("emptyContentFromTemplateSchema (manual typed draft)", () => {
  it("creates empty markdown sections plus a body chart", () => {
    const osteo = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_osteo_session");
    assert.ok(osteo);
    const raw = emptyContentFromTemplateSchema({ sections: osteo.sections });
    const content = sanitizeNoteContent(raw);
    for (const section of osteo.sections) {
      if (section.type === "body_map") continue;
      assert.equal(content[section.id], "");
    }
    assert.deepEqual(content[BODY_MAP_CONTENT_KEY], emptyBodyMap());
  });

  it("still adds a body chart when the schema omits one", () => {
    const content = sanitizeNoteContent(
      emptyContentFromTemplateSchema({
        sections: [
          { id: "subjective", title: "Subjective", type: "markdown" },
          { id: "plan", title: "Plan", type: "markdown" },
        ],
      }),
    );
    assert.equal(content.subjective, "");
    assert.equal(content.plan, "");
    assert.deepEqual(content[BODY_MAP_CONTENT_KEY], emptyBodyMap());
  });
});

describe("createManualDraft idempotency policy", () => {
  it("creates a manual draft when none exists", () => {
    const result = resolveManualDraftAction(null);
    assert.equal(result.action, "create");
    assert.equal(result.source, "manual");
  });

  it("reuses the same draft on a second call", () => {
    const existing = {
      id: "note_1",
      source: "manual",
      content: { subjective: "typed already" },
    };
    const first = resolveManualDraftAction(existing);
    const second = resolveManualDraftAction(existing);
    assert.equal(first.action, "reuse");
    assert.equal(second.action, "reuse");
    assert.equal(first.note?.id, second.note?.id);
    assert.equal(second.note?.content.subjective, "typed already");
  });

  it("does not wipe an existing AI draft with blank content", () => {
    const aiDraft = {
      id: "note_ai",
      source: "ai",
      content: { subjective: "From organise", plan: "HEP" },
    };
    const result = resolveManualDraftAction(aiDraft);
    assert.equal(result.action, "reuse");
    assert.equal(result.note?.source, "ai");
    assert.equal(result.note?.content.subjective, "From organise");
  });
});
