import { badRequest } from "@/server/errors";

/** Detect real file type from magic bytes (do not trust client Content-Type). */
export function sniffPatientFileMime(bytes: Buffer): string | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

export function assertMagicMatchesClaim(
  bytes: Buffer,
  claimedMime: string,
): string {
  const sniffed = sniffPatientFileMime(bytes);
  if (!sniffed) {
    throw badRequest(
      "File contents are not a valid PDF, JPEG, or PNG",
    );
  }
  const claimed = claimedMime.trim().toLowerCase();
  // Allow client to omit/mislabel if magic is clear — trust sniffed type
  if (
    claimed &&
    claimed !== "application/octet-stream" &&
    claimed !== sniffed
  ) {
    // JPEG often sent as image/jpg
    if (!(claimed === "image/jpg" && sniffed === "image/jpeg")) {
      throw badRequest(
        `File type mismatch: contents are ${sniffed}, not ${claimed}`,
      );
    }
  }
  return sniffed;
}

/** Safe ASCII filename for Content-Disposition (no CR/LF / quotes). */
export function contentDispositionFilename(filename: string) {
  const safe = filename
    .replace(/[\r\n\0"]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, 180);
  return safe || "attachment";
}
