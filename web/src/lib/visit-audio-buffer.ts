/**
 * Local durable buffer for visit audio (IndexedDB).
 * Survives refresh / brief network loss so Stop & organise can retry
 * without re-recording the consult.
 */

const DB_NAME = "treow-visit-audio";
const DB_VERSION = 1;
const STORE = "buffers";

export type VisitAudioBuffer = {
  visitId: string;
  blob: Blob;
  mimeType: string;
  filename: string;
  durationSec: number;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "visitId" });
      }
    };
  });
}

export async function saveVisitAudioBuffer(
  entry: Omit<VisitAudioBuffer, "updatedAt">,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      tx.objectStore(STORE).put({
        ...entry,
        updatedAt: Date.now(),
      } satisfies VisitAudioBuffer);
    });
    db.close();
  } catch {
    // Best-effort — recording still works in memory
  }
}

export async function loadVisitAudioBuffer(
  visitId: string,
): Promise<VisitAudioBuffer | null> {
  try {
    const db = await openDb();
    const row = await new Promise<VisitAudioBuffer | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(visitId);
        req.onsuccess = () => resolve(req.result as VisitAudioBuffer | undefined);
        req.onerror = () =>
          reject(req.error ?? new Error("IndexedDB read failed"));
      },
    );
    db.close();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function clearVisitAudioBuffer(visitId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
      tx.objectStore(STORE).delete(visitId);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/** Prefer formats Safari/iOS MediaRecorder actually supports. */
export function pickRecordingMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "audio/webm", extension: "webm" };
  }
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "mp4" },
    { mimeType: "audio/aac", extension: "aac" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", extension: "webm" };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 700;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw last instanceof Error ? last : new Error("Request failed");
}
