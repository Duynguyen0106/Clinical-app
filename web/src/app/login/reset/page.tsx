"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ApiError } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Missing reset token — open the link from your email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ token, password }),
      });
      router.replace("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <h1>Choose a new password</h1>
      <p className="muted">At least 8 characters. You will sign in again.</p>
      <label className="field">
        <span>New password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" className="btn-primary" disabled={busy || !token}>
        {busy ? "Saving…" : "Update password"}
      </button>
      <Link href="/login" className="btn-ghost">
        Back to sign in
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <BrandLogo variant="full" className="auth-logo" priority />
        <p className="brand-motto">{BRAND.motto}</p>
      </div>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
