import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapSoapToTemplateSections,
  matchTemplateForAppointment,
  orderedSectionIds,
  sectionLabel,
} from "../../src/modules/ai/map-to-template";
import { MSK_TEMPLATE_PACK } from "../../src/modules/notes/templates";
import { PULSE_METRIC_LINKS, pulseLinksPayload } from "../../src/modules/ops/pulse-links";
import type { SoapNoteContent } from "../../src/modules/ai/mock-pipeline";

const soap: SoapNoteContent = {
  subjective: "Subjective text",
  objective: "Objective text",
  assessment: "Assessment text with no red-flag wording",
  plan: "Plan text",
  clinician_review_flags: ["Check imaging"],
};

describe("mapSoapToTemplateSections", () => {
  it("maps physio initial including red_flags", () => {
    const tpl = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_physio_initial")!;
    const out = mapSoapToTemplateSections(soap, tpl.sections);
    assert.equal(out.subjective, soap.subjective);
    assert.equal(out.plan, soap.plan);
    assert.match(String(out.red_flags), /Red-flag screen/i);
    assert.deepEqual(out.clinician_review_flags, ["Check imaging"]);
  });

  it("maps osteopathy presentation/findings/treatment", () => {
    const tpl = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_osteo_session")!;
    const out = mapSoapToTemplateSections(soap, tpl.sections);
    assert.match(String(out.presentation), /Presenting complaint/);
    assert.match(String(out.findings), /Examination findings/);
    assert.match(String(out.treatment), /Treatment today/);
    assert.equal(out.plan, soap.plan);
  });

  it("maps manual therapy techniques/response", () => {
    const tpl = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_manual_therapy")!;
    const out = mapSoapToTemplateSections(soap, tpl.sections);
    assert.equal(out.subjective, soap.subjective);
    assert.match(String(out.techniques), /Techniques applied/);
    assert.match(String(out.response), /Patient response/);
  });
});

describe("matchTemplateForAppointment", () => {
  const rows = MSK_TEMPLATE_PACK.map((t) => ({
    id: t.id,
    name: t.name,
    isDefault: Boolean(t.isDefault),
  }));

  it("maps Physio · Follow-up to Physio · Review", () => {
    const m = matchTemplateForAppointment("Physio · Follow-up", rows);
    assert.equal(m?.name, "Physio · Review");
  });

  it("maps Osteopathy session to osteo template", () => {
    const m = matchTemplateForAppointment("Osteopathy session", rows);
    assert.equal(m?.name, "Osteopathy session");
  });

  it("maps Manual therapy appointment", () => {
    const m = matchTemplateForAppointment("Manual therapy", rows);
    assert.equal(m?.name, "Manual therapy");
  });

  it("maps initial assessment to physio initial", () => {
    const m = matchTemplateForAppointment("Physio · Initial assessment", rows);
    assert.equal(m?.name, "Physio · Initial assessment");
  });
});

describe("section ordering helpers", () => {
  it("orders fields by template and labels by title", () => {
    const tpl = MSK_TEMPLATE_PACK.find((t) => t.id === "tpl_osteo_session")!;
    const keys = ["plan", "treatment", "presentation", "findings", "extra"];
    assert.deepEqual(orderedSectionIds(keys, tpl.sections), [
      "presentation",
      "findings",
      "treatment",
      "plan",
      "extra",
    ]);
    assert.equal(sectionLabel("presentation", tpl.sections), "Presentation");
  });
});

describe("pulse links", () => {
  it("includes deep-links for unsigned and unpaid", () => {
    const links = pulseLinksPayload();
    assert.equal(links.unsigned, "/app/notes?status=DRAFT");
    assert.equal(links.unpaid, "/app/money?status=unpaid");
    assert.equal(PULSE_METRIC_LINKS.length, 5);
  });
});
