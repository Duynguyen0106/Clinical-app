"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { api, ApiError } from "@/lib/api";

type Prefs = {
  clinicName: string;
  clinicSlug: string;
  patientFirstName: string;
  email: string | null;
  marketingOptedIn: boolean;
};

type Props = { params: Promise<{ token: string }> };

export default function EmailPrefsPage({ params }: Props) {
  const { token: rawToken } = use(params);
  const token = decodeURIComponent(rawToken);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ prefs: Prefs }>(
      `/public/email-prefs?token=${encodeURIComponent(token)}`,
      { auth: false },
    )
      .then((d) => setPrefs(d.prefs))
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      await api("/public/email-prefs", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          token,
          action: "unsubscribe_marketing",
        }),
      });
      setPrefs((p) => (p ? { ...p, marketingOptedIn: false } : p));
      setMessage(
        "You're unsubscribed from thank-you and review emails from this clinic.",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(165deg,#eef3f1_0%,#f7f5f0_55%,#e8efe9_100%)] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          <BrandLogo className="h-9 w-9" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1E3F37]">
              {BRAND.name}
            </p>
            <p className="text-sm text-[#5b6b66]">Email preferences</p>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {prefs ? (
          <section className="rounded-2xl border border-[#d5e0db] bg-white px-6 py-7 shadow-sm">
            <h1 className="font-serif text-3xl text-[#14201c]">
              Hi {prefs.patientFirstName}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#24332e]">
              Manage marketing emails from{" "}
              <span className="font-medium">{prefs.clinicName}</span>
              {prefs.email ? (
                <>
                  {" "}
                  for <span className="font-medium">{prefs.email}</span>
                </>
              ) : null}
              .
            </p>

            {message ? (
              <p className="mt-5 rounded-xl border border-[#cfe0d8] bg-[#f3f8f5] px-4 py-3 text-sm text-[#1E3F37]">
                {message}
              </p>
            ) : null}

            {prefs.marketingOptedIn ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void unsubscribe()}
                className="mt-6 inline-flex rounded-xl bg-[#1E3F37] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Updating…" : "Unsubscribe from thank-you & review emails"}
              </button>
            ) : (
              <p className="mt-6 text-sm text-[#5b6b66]">
                You are not opted in to thank-you or review emails from this
                clinic.
              </p>
            )}

            <p className="mt-8 text-sm text-[#5b6b66]">
              <Link
                href={`/book/${prefs.clinicSlug}`}
                className="font-medium text-[#1E3F37] underline-offset-2 hover:underline"
              >
                Book online
              </Link>
            </p>
          </section>
        ) : !error ? (
          <p className="text-sm text-[#5b6b66]">Loading preferences…</p>
        ) : null}
      </div>
    </main>
  );
}
