import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PATIENT_FILE_MAX_BYTES,
  assertAllowedPatientFile,
} from "@/modules/patients/files";

describe("patient file allowlist", () => {
  it("accepts PDF JPEG PNG under 10 MB", () => {
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
});
