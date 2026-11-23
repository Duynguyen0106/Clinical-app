import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReceiptDocument } from "./service";

/** WinAnsi-safe text for StandardFonts (strip combining marks). */
export function pdfSafeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "?")
    .trim();
}

function formatGbp(pence: number, currency: string) {
  const pounds = (pence / 100).toFixed(2);
  return currency === "GBP" ? `GBP ${pounds}` : `${currency} ${pounds}`;
}

function formatTreatmentDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

function formatPaymentMethod(method: string) {
  return method.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function paymentMethodLabel(doc: ReceiptDocument) {
  if (doc.payments.length === 0) {
    return doc.status === "PAID" ? "-" : "Unpaid";
  }
  const unique = [
    ...new Set(doc.payments.map((p) => formatPaymentMethod(p.method))),
  ];
  return unique.join(", ");
}

function dataUrlToBytes(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase().replace("jpg", "jpeg");
  const b64 = m[2];
  if (typeof Buffer !== "undefined") {
    return { mime, bytes: new Uint8Array(Buffer.from(b64, "base64")) };
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

function drawWrapped(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    size: number;
    font: PDFFont;
    maxWidth: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
  },
): number {
  const lineHeight = opts.lineHeight ?? opts.size * 1.35;
  const color = opts.color ?? rgb(0.12, 0.14, 0.18);
  const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
  let line = "";
  let y = opts.y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (opts.font.widthOfTextAtSize(next, opts.size) > opts.maxWidth && line) {
      page.drawText(line, {
        x: opts.x,
        y,
        size: opts.size,
        font: opts.font,
        color,
      });
      y -= lineHeight;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    page.drawText(line, {
      x: opts.x,
      y,
      size: opts.size,
      font: opts.font,
      color,
    });
    y -= lineHeight;
  }
  return y;
}

/**
 * Build an A4 itemised receipt/invoice PDF matching the print layout fields.
 * Returns raw PDF bytes (for base64 email attachment or download).
 */
export async function buildReceiptPdf(
  doc: ReceiptDocument,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const margin = 48;
  const maxX = 595.28 - margin;
  const width = maxX - margin;
  let y = 841.89 - margin;

  const accentHex = (doc.clinic.brandColour?.trim() || "#1f7a7a").replace(
    "#",
    "",
  );
  const ah = accentHex.length === 3
    ? accentHex
        .split("")
        .map((c) => c + c)
        .join("")
    : accentHex.padEnd(6, "0").slice(0, 6);
  const accent = rgb(
    parseInt(ah.slice(0, 2), 16) / 255,
    parseInt(ah.slice(2, 4), 16) / 255,
    parseInt(ah.slice(4, 6), 16) / 255,
  );
  const navy = rgb(0.1, 0.17, 0.28);
  const muted = rgb(0.35, 0.4, 0.45);
  const paid = doc.status === "PAID";
  const title = paid ? "Itemised receipt" : "Itemised invoice";

  // Brand / logo
  if (doc.clinic.logoDataUrl) {
    const parsed = dataUrlToBytes(doc.clinic.logoDataUrl);
    if (parsed) {
      try {
        const img =
          parsed.mime.includes("png")
            ? await pdf.embedPng(parsed.bytes)
            : await pdf.embedJpg(parsed.bytes);
        const maxH = 48;
        const scale = Math.min(140 / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, {
          x: margin,
          y: y - h,
          width: w,
          height: h,
        });
        y -= h + 12;
      } catch {
        page.drawText(pdfSafeText(doc.clinic.name), {
          x: margin,
          y: y - 14,
          size: 14,
          font: bold,
          color: navy,
        });
        y -= 28;
      }
    }
  } else {
    page.drawText(pdfSafeText(doc.clinic.name), {
      x: margin,
      y: y - 14,
      size: 14,
      font: bold,
      color: navy,
    });
    y -= 28;
  }

  page.drawText(title, {
    x: margin,
    y,
    size: 20,
    font: bold,
    color: navy,
  });
  y -= 18;
  page.drawText("Patient copy", {
    x: margin,
    y,
    size: 10,
    font,
    color: muted,
  });
  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: maxX, y },
    thickness: 2,
    color: accent,
  });
  y -= 28;

  const prac = doc.practitioner;
  if (prac) {
    page.drawText("PRACTITIONER", {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: accent,
    });
    y -= 14;
    page.drawText(pdfSafeText(prac.displayName), {
      x: margin,
      y,
      size: 12,
      font: bold,
      color: navy,
    });
    y -= 14;
    if (prac.registrationBody && prac.registerName) {
      y = drawWrapped(
        page,
        `${prac.registrationBody} register name: ${prac.registerName}`,
        { x: margin, y, size: 9, font, maxWidth: width, color: muted },
      );
    }
    if (prac.registrationNumber) {
      const reg = prac.registrationBody
        ? `${prac.registrationBody} Reg. No. ${prac.registrationNumber}`
        : `Reg. No. ${prac.registrationNumber}`;
      page.drawText(pdfSafeText(reg), {
        x: margin,
        y,
        size: 9,
        font,
        color: muted,
      });
      y -= 12;
    } else if (prac.professionalTitle) {
      page.drawText(pdfSafeText(prac.professionalTitle), {
        x: margin,
        y,
        size: 9,
        font,
        color: muted,
      });
      y -= 12;
    }
    y -= 10;
  }

  // Clinic block
  page.drawText(pdfSafeText(doc.clinic.name), {
    x: margin,
    y,
    size: 11,
    font: bold,
    color: navy,
  });
  y -= 14;
  if (doc.clinic.address) {
    y = drawWrapped(page, doc.clinic.address, {
      x: margin,
      y,
      size: 9,
      font,
      maxWidth: width,
      color: muted,
    });
  }
  const contact = [doc.clinic.phone, doc.clinic.email].filter(Boolean).join(" · ");
  if (contact) {
    page.drawText(pdfSafeText(contact), {
      x: margin,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 12;
  }
  if (doc.clinic.website) {
    page.drawText(pdfSafeText(doc.clinic.website), {
      x: margin,
      y,
      size: 9,
      font,
      color: muted,
    });
    y -= 12;
  }
  y -= 16;

  page.drawText("Treatment details", {
    x: margin,
    y,
    size: 12,
    font: bold,
    color: navy,
  });
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: maxX, y },
    thickness: 0.5,
    color: rgb(0.75, 0.78, 0.8),
  });
  y -= 18;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Patient name", value: doc.patient.fullName },
    {
      label: "Date of treatment",
      value: formatTreatmentDate(
        doc.appointmentStartsAt ?? doc.paidAt ?? doc.issuedAt,
      ),
    },
    { label: "Service", value: doc.serviceName ?? "Consultation" },
    {
      label: "Duration",
      value:
        doc.durationMinutes != null ? `${doc.durationMinutes} minutes` : "-",
    },
    {
      label: paid ? "Fee paid" : "Fee due",
      value: formatGbp(doc.amountCents, doc.currency),
    },
    { label: "Payment method", value: paymentMethodLabel(doc) },
    { label: "Receipt / Ref no.", value: doc.reference },
  ];

  for (const row of rows) {
    page.drawText(pdfSafeText(row.label), {
      x: margin,
      y,
      size: 9,
      font,
      color: muted,
    });
    const value = pdfSafeText(row.value);
    const valueWidth = bold.widthOfTextAtSize(value, 10);
    page.drawText(value, {
      x: Math.max(margin + 160, maxX - valueWidth),
      y,
      size: 10,
      font: bold,
      color: navy,
    });
    y -= 16;
    page.drawLine({
      start: { x: margin, y: y + 6 },
      end: { x: maxX, y: y + 6 },
      thickness: 0.25,
      color: rgb(0.88, 0.9, 0.92),
    });
  }

  y -= 16;
  y = drawWrapped(
    page,
    "This receipt confirms payment for osteopathic / related clinical care. For insurance or cash-plan claims, quote the practitioner name and registration number above. No GP referral is required by the clinic.",
    { x: margin, y, size: 8, font, maxWidth: width, color: muted, lineHeight: 11 },
  );

  y -= 28;
  const colW = (width - 24) / 2;
  for (const [i, label] of [
    "Practitioner signature",
    "Patient acknowledgement",
  ].entries()) {
    const x = margin + i * (colW + 24);
    page.drawText(label.toUpperCase(), {
      x,
      y,
      size: 7,
      font: bold,
      color: accent,
    });
    page.drawLine({
      start: { x, y: y - 28 },
      end: { x: x + colW, y: y - 28 },
      thickness: 0.75,
      color: rgb(0.55, 0.58, 0.62),
    });
    page.drawText("Date", {
      x,
      y: y - 44,
      size: 8,
      font,
      color: muted,
    });
  }

  page.drawText(
    pdfSafeText(`Printed ${new Date(doc.printedAt).toLocaleString("en-GB")}`),
    {
      x: margin,
      y: 36,
      size: 7,
      font,
      color: muted,
    },
  );

  return pdf.save();
}

export async function receiptPdfAttachment(doc: ReceiptDocument) {
  const bytes = await buildReceiptPdf(doc);
  return {
    filename: `${doc.reference}.pdf`,
    content: Buffer.from(bytes).toString("base64"),
    contentType: "application/pdf" as const,
  };
}
