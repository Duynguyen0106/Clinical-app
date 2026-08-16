"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";
import {
  TurnstileField,
  turnstileEnabledInBrowser,
} from "@/components/TurnstileField";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRequired = turnstileEnabledInBrowser();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (captchaRequired && !captchaToken) {
      setError("Complete the security check first.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const d = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          email,
          captchaToken: captchaToken || undefined,
        }),
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
        <TurnstileField onToken={setCaptchaToken} />
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="alert-line">{message}</p> : null}
        <button
          type="submit"
          className="btn-primary"
          disabled={busy || (captchaRequired && !captchaToken)}
        >
          {busy ? "Sending…" : "Send reset link"}
        </button>
        <Link href="/login" className="btn-ghost">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
