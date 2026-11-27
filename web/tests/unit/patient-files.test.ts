import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PATIENT_FILE_MAX_BYTES,
  assertAllowedPatientFile,
  contentDispositionFilename,
} from "@/modules/patients/files";
import {
  assertMagicMatchesClaim,
  sniffPatientFileMime,
} from "@/modules/patients/file-bytes";

describe("patient file allowlist", () => {
  it("accepts PDF JPEG PNG under 10 MB (mime-only path)", () => {
    assert.equal(
      assertAllowedPatientFile({
        mimeType: "application/pdf",
        sizeBytes: 1024,
      }),
      "application/pdf",
    );
    assert.equal(
      assertAllowedPatientFile({
        mimeType: "image/jpeg",
        sizeBytes: 2048,
      }),
      "image/jpeg",
    );
    assert.equal(
      assertAllowedPatientFile({
        mimeType: "image/png",
        sizeBytes: PATIENT_FILE_MAX_BYTES,
      }),
      "image/png",
    );
  });

  it("rejects disallowed mime and oversized files", () => {
    assert.throws(
      () =>
        assertAllowedPatientFile({
          mimeType: "application/zip",
          sizeBytes: 100,
        }),
      /PDF, JPEG, and PNG/i,
    );
    assert.throws(
      () =>
        assertAllowedPatientFile({
          mimeType: "application/pdf",
          sizeBytes: PATIENT_FILE_MAX_BYTES + 1,
        }),
      /10 MB/i,
    );
    assert.throws(
      () =>
        assertAllowedPatientFile({
          mimeType: "application/pdf",
          sizeBytes: 0,
        }),
      /Empty/i,
    );
  });

  it("sniffs magic bytes and rejects spoofed content", () => {
    const pdf = Buffer.from("%PDF-1.4\n% fake");
    assert.equal(sniffPatientFileMime(pdf), "application/pdf");
    assert.equal(assertMagicMatchesClaim(pdf, "application/pdf"), "application/pdf");
    assert.throws(
      () => assertMagicMatchesClaim(pdf, "image/png"),
      /mismatch/i,
    );
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    assert.equal(sniffPatientFileMime(jpeg), "image/jpeg");
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
    ]);
    assert.equal(sniffPatientFileMime(png), "image/png");
    assert.throws(
      () =>
        assertAllowedPatientFile({
          mimeType: "application/pdf",
          sizeBytes: 8,
          bytes: Buffer.from("not-a-pdf"),
        }),
      /not a valid/i,
    );
  });

  it("strips header-injection characters from download filenames", () => {
    assert.equal(
      contentDispositionFilename('evil\r\nSet-Cookie: x="y".pdf'),
      "evilSet-Cookie: x=y.pdf",
    );
  });
});
