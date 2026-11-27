"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/components/AuthProvider";
import { ApiError, api, getClinicId, getToken } from "@/lib/api";

type PatientFileRow = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
};

type Props = {
  patientId: string;
  compact?: boolean;
  className?: string;
  /**
   * When true (default for compact/prep), do not hit the API until the user
   * expands Files — avoids Neon WS fan-out / Cloudflare 1101 on diary open.
   */
  lazy?: boolean;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PatientFilesPanel({
  patientId,
  compact = false,
  className,
  lazy,
}: Props) {
  const { me } = useAuth();
  const lazyLoad = lazy ?? compact;
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(!lazyLoad);
  const [files, setFiles] = useState<PatientFileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const canDownload = (f: PatientFileRow) => {
    if (!me) return false;
    if (me.role === "OWNER" || me.role === "PRACTITIONER") return true;
    return Boolean(f.uploadedBy && f.uploadedBy.id === me.user.id);
  };
  const canDelete = (f: PatientFileRow) => {
    if (!me) return false;
    if (me.role === "OWNER") return true;
    return Boolean(f.uploadedBy && f.uploadedBy.id === me.user.id);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<{ files: PatientFileRow[] }>(
        `/patients/${patientId}/files`,
      );
      setFiles(d.files);
      setLoadedFor(patientId);
    } catch (e) {
      // Soft-fail — do not bubble "Server overloaded" into the whole prep sheet
      setError(
        e instanceof Error ? e.message : "Could not load files — try again",
      );
      setFiles([]);
      setLoadedFor(patientId);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    setExpanded(!lazyLoad);
    setFiles([]);
    setLoadedFor(null);
    setError(null);
    setMessage(null);
  }, [patientId, lazyLoad]);

  useEffect(() => {
    if (!expanded) return;
    if (loadedFor === patientId) return;
    void load();
  }, [expanded, loadedFor, patientId, load]);

  async function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const d = await api<{ file: PatientFileRow }>(
        `/patients/${patientId}/files`,
        { method: "POST", body },
      );
      setFiles((prev) => [d.file, ...prev.filter((f) => f.id !== d.file.id)]);
      setMessage(`Uploaded ${d.file.filename}`);
      setExpanded(true);
      setLoadedFor(patientId);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Upload failed — PDF, JPEG or PNG up to 10 MB",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDownload(file: PatientFileRow) {
    setError(null);
    try {
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const clinicId = getClinicId();
      if (clinicId) headers.set("X-Clinic-Id", clinicId);
      const res = await fetch(
        `/api/v1/patients/${patientId}/files/${file.id}`,
        { credentials: "same-origin", headers },
      );
      if (!res.ok) {
        const raw = await res.text();
        let msg = "Download failed";
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string } };
          if (parsed.error?.message) msg = parsed.error.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function onDelete(file: PatientFileRow) {
    if (!window.confirm(`Delete ${file.filename}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/patients/${patientId}/files/${file.id}`, {
        method: "DELETE",
      });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      setMessage(`Deleted ${file.filename}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className ?? "patient-files"}>
      <div className="panel-head" style={{ marginBottom: "0.5rem" }}>
        <h3 style={{ margin: 0, fontSize: compact ? "1rem" : undefined }}>
          Files
        </h3>
        <div className="home-cta" style={{ margin: 0 }}>
          {lazyLoad && !expanded ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setExpanded(true)}
            >
              Show files
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Working…" : "Upload"}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          hidden
          onChange={(e) => void onUpload(e.target.files)}
        />
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Referral letters, imaging, or other attachments (PDF, JPEG, PNG · max
        10 MB).
      </p>
      {!expanded ? (
        <p className="muted">Expand to load attachments for this patient.</p>
      ) : null}
      {expanded ? (
        <>
          {error ? <p className="alert-line">{error}</p> : null}
          {message ? <p className="muted">{message}</p> : null}
          {loading ? (
            <p className="muted">Loading files…</p>
          ) : files.length === 0 && !error ? (
            <p className="muted">No files yet.</p>
          ) : (
            <ul
              className="patient-files-list"
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
              {files.map((f) => (
                <li
                  key={f.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0",
                    borderTop: "1px solid var(--border, #e5e7eb)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: "1 1 12rem" }}>
                    <div style={{ fontWeight: 600, wordBreak: "break-word" }}>
                      {f.filename}
                    </div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {formatSize(f.sizeBytes)} ·{" "}
                      {format(new Date(f.createdAt), "d MMM yyyy HH:mm")}
                      {f.uploadedBy ? ` · ${f.uploadedBy.name}` : ""}
                    </div>
                  </div>
                  <div className="home-cta" style={{ margin: 0 }}>
                    {canDownload(f) ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => void onDownload(f)}
                      >
                        Download
                      </button>
                    ) : null}
                    {canDelete(f) ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => void onDelete(f)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
