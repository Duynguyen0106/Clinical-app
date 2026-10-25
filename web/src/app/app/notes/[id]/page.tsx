"use client";

import { use } from "react";
import { AppShell } from "@/components/AppShell";
import { ClinicalChartWorkspace } from "@/components/ClinicalChartWorkspace";

export default function NoteChartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AppShell
      title="Chart"
      subtitle="Structured clinical note and body chart."
    >
      <ClinicalChartWorkspace noteId={id} />
    </AppShell>
  );
}
