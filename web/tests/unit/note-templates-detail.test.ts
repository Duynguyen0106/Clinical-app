import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MSK_TEMPLATE_PACK,
  packTemplateByName,
} from "../../src/modules/notes/templates";
import { BODY_MAP_CONTENT_KEY } from "../../src/modules/notes/body-map";

describe("MSK_TEMPLATE_PACK detail", () => {
  it("every section has a clinical hint", () => {
    for (const tpl of MSK_TEMPLATE_PACK) {
      for (const section of tpl.sections) {
        assert.ok(
          section.hint && section.hint.length > 20,
          `${tpl.id}/${section.id} needs a detailed hint`,
        );
      }
    }
  });

  it("osteopathy session covers history, impression, response, and red flags", () => {
    const osteo = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_osteo_session")!;
    const ids = osteo.sections.map((s) => s.id);
    for (const id of [
      "presentation",
      "history",
      "findings",
      BODY_MAP_CONTENT_KEY,
      "assessment",
      "treatment",
      "response",
      "plan",
      "red_flags",
    ]) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
    assert.ok(osteo.sections.length >= 8);
  });

  it("physio initial includes past medical, goals, and red flags", () => {
    const physio = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_physio_initial")!;
    const ids = physio.sections.map((s) => s.id);
    assert.ok(ids.includes("past_medical"));
    assert.ok(ids.includes("goals"));
    assert.ok(ids.includes("red_flags"));
  });

  it("physio review tracks progress and outcome measures", () => {
    const review = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_physio_review")!;
    const ids = review.sections.map((s) => s.id);
    assert.ok(ids.includes("progress_since_last"));
    assert.ok(ids.includes("outcome_measures"));
  });

  it("packTemplateByName resolves seeded clinic names", () => {
    assert.equal(
      packTemplateByName("Osteopathy session")?.id,
      "tpl_osteo_session",
    );
    assert.equal(
      packTemplateByName("Physio · Initial assessment")?.id,
      "tpl_physio_initial",
    );
  });
});
