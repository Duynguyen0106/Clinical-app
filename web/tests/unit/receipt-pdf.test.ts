import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReceiptPdf,
  pdfSafeText,
  receiptPdfAttachment,
} from "@/modules/billing/receipt-pdf";
import type { ReceiptDocument } from "@/modules/billing/service";

function sampleDoc(overrides: Partial<ReceiptDocument> = {}): ReceiptDocument {
  return {
    kind: "receipt",
    invoiceId: "inv_test_01",
    reference: "INV-TEST01AB",
    clinic: {
      name: "Nguyen's Osteopathy",
      phone: "01234 567890",
      email: "clinic@example.com",
      address: "12 High Street, London",
      website: "https://example.com",
      brandColour: "#1f7a7a",
      logoDataUrl: null,
    },
    patient: {
      fullName: "Nhật Anh Phạm",
      email: "patient@example.com",
      phone: "07000000000",
    },
    serviceName: "Follow-up osteopathy",
    durationMinutes: 30,
    practitioner: {
      displayName: "Duy Nguyen",
      registerName: "Duy Nguyen",
      professionalTitle: "Osteopath",
      registrationBody: "GOsC",
      registrationNumber: "1234",
    },
    practitionerName: "Duy Nguyen",
    appointmentStartsAt: "2026-11-20T10:00:00.000Z",
    amountCents: 5500,
    currency: "GBP",
    status: "PAID",
    issuedAt: "2026-11-20T10:30:00.000Z",
    paidAt: "2026-11-20T10:35:00.000Z",
    payments: [
      {
        amountCents: 5500,
        method: "CARD",
        paidAt: "2026-11-20T10:35:00.000Z",
      },
    ],
    printedAt: "2026-11-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("receipt PDF", () => {
  it("strips combining marks for WinAnsi fonts", () => {
    assert.equal(pdfSafeText("Nhật Anh Phạm"), "Nhat Anh Pham");
  });

  it("builds a valid PDF document", async () => {
    const bytes = await buildReceiptPdf(sampleDoc());
    assert.ok(bytes.byteLength > 500);
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("utf8"), "%PDF-");
  });

  it("builds a base64 email attachment", async () => {
    const attach = await receiptPdfAttachment(sampleDoc());
    assert.equal(attach.filename, "INV-TEST01AB.pdf");
    assert.equal(attach.contentType, "application/pdf");
    assert.equal(Buffer.from(attach.content, "base64").subarray(0, 5).toString(), "%PDF-");
  });
});
