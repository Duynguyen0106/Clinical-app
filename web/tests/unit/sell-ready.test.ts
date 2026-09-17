import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWebsiteSnippets } from "../../src/modules/clinic/website";
import { provisionClinicSchema } from "../../src/modules/clinic/provision";
import { SAAS_PLANS } from "../../src/modules/billing/subscription";

describe("getWebsiteSnippets", () => {
  it("builds book and embed URLs from base + slug", () => {
    const s = getWebsiteSnippets({
      appBaseUrl: "https://app.treow.example/",
      slug: "riverside-physio",
      clinicName: "Riverside",
      brandColour: "#123456",
    });
    assert.equal(s.bookUrl, "https://app.treow.example/book/riverside-physio");
    assert.equal(s.embedUrl, "https://app.treow.example/embed/riverside-physio");
    assert.match(s.buttonHtml, /Book online/);
    assert.match(s.buttonHtml, /#123456/);
    assert.match(s.iframeHtml, /embed\/riverside-physio/);
  });
});

describe("provisionClinicSchema", () => {
  it("accepts a valid provision payload", () => {
    const parsed = provisionClinicSchema.parse({
      name: "Riverside Physio",
      slug: "riverside-physio",
      owner: {
        email: "owner@riverside.example",
        name: "Pat Owner",
        password: "securepass1",
      },
    });
    assert.equal(parsed.slug, "riverside-physio");
  });

  it("rejects invalid slugs", () => {
    assert.throws(() =>
      provisionClinicSchema.parse({
        name: "Bad",
        slug: "Bad Slug",
        owner: {
          email: "a@b.co",
          name: "A",
          password: "securepass1",
        },
      }),
    );
  });
});

describe("SAAS_PLANS", () => {
  it("exposes starter and clinic tiers", () => {
    assert.ok(SAAS_PLANS.some((p) => p.id === "STARTER"));
    assert.ok(SAAS_PLANS.some((p) => p.id === "CLINIC"));
    const starter = SAAS_PLANS.find((p) => p.id === "STARTER");
    assert.match(starter?.blurb ?? "", /clinic|diary|notes|booking/i);
  });
});
