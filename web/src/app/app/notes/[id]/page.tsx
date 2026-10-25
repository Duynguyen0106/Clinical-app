"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { ClinicalChartWorkspace } from "@/components/ClinicalChartWorkspace";

export default function NoteChartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const isClinician = me?.role === "OWNER" || me?.role === "PRACTITIONER";

  useEffect(() => {
    if (authLoading || !me) return;
    if (!isClinician) router.replace("/app");
  }, [authLoading, me, isClinician, router]);

  if (!authLoading && me && !isClinician) {
    return (
      <AppShell title="Chart" subtitle="Clinician only.">
        <p className="muted">Redirecting…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Chart"
      subtitle="Structured clinical note and body chart."
    >
      <ClinicalChartWorkspace noteId={id} />
    </AppShell>
  );
}
