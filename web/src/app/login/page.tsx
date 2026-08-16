"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { BRAND } from "@/modules/config/brand";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("alex@northbank.example");
  const [password, setPassword] = useState("treow-demo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="book-page">
      <form className="book-card" onSubmit={onSubmit}>
        <p className="brand-mark">{BRAND.shortName}</p>
        <h1>Sign in</h1>
        <p className="muted">Clinic staff — UK demo clinic ready to go.</p>
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
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Open clinic"}
        </button>
        <Link href="/" className="btn-ghost">
          Back
        </Link>
      </form>
    </div>
  );
}
