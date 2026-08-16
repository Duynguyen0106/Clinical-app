import { createHash } from "node:crypto";

/** Stable SHA-256 of note JSON content for sign integrity. */
export function hashNoteContent(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
