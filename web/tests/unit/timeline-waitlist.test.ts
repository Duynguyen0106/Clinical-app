import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPatientTimeline } from "../../src/modules/patients/timeline";
import {
  createWaitlistOfferToken,
  verifyWaitlistOfferToken,
} from "../../src/modules/scheduling/waitlist-token";

describe("buildPatientTimeline", () => {
  it("merges appointments, notes, and invoices newest first", () => {
    const items = buildPatientTimeline({
      includeNotes: true,
      appointments: [
        {
          id: "a1",
          startsAt: new Date("2026-08-10T10:00:00Z"),
          status: "COMPLETED",
          appointmentType: { name: "Review" },
          practitioner: { displayName: "Jordan" },
          visit: { id: "v1" },
        },
      ],
      notes: [
        {
          id: "n1",
          status: "SIGNED",
          signedAt: new Date("2026-08-10T10:40:00Z"),
          createdAt: new Date("2026-08-10T10:35:00Z"),
          template: { name: "Osteo SOAP" },
          visitId: "v1",
        },
      ],
      invoices: [
        {
          id: "i1",
          amountCents: 5500,
          currency: "GBP",
          status: "PAID",
          issuedAt: new Date("2026-08-10T11:00:00Z"),
          paidAt: new Date("2026-08-10T11:05:00Z"),
          createdAt: new Date("2026-08-10T11:00:00Z"),
        },
      ],
    });
    assert.equal(items.length, 3);
    assert.equal(items[0].kind, "invoice");
    assert.equal(items[1].kind, "note");
    assert.equal(items[2].kind, "appointment");
  });

  it("omits notes when includeNotes is false", () => {
    const items = buildPatientTimeline({
      includeNotes: false,
      appointments: [],
      notes: [
        {
          id: "n1",
          status: "SIGNED",
          signedAt: new Date(),
          createdAt: new Date(),
          template: null,
          visitId: null,
        },
      ],
      invoices: [],
    });
    assert.equal(items.length, 0);
  });
});

describe("waitlist offer token", () => {
  it("round-trips entry id before expiry", () => {
    const exp = Date.now() + 60_000;
    const token = createWaitlistOfferToken("entry_abc", exp);
    const verified = verifyWaitlistOfferToken(token);
    assert.equal(verified.entryId, "entry_abc");
  });
});
