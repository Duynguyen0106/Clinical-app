"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email }),
      });
      setMessage(d.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <BrandLogo variant="full" className="auth-logo" priority />
        <p className="brand-motto">{BRAND.motto}</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>Forgot password</h1>
        <p className="muted">
          Enter your staff email and we will send a reset link if an account
          exists.
        </p>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="alert-line">{message}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
        <Link href="/login" className="btn-ghost">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
