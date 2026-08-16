"use client";

import { use } from "react";
import { AppShell } from "@/components/AppShell";
import { VisitRecorder } from "@/components/VisitRecorder";

type Props = { params: Promise<{ id: string }> };

export default function VisitPage({ params }: Props) {
  const { id } = use(params);

  return (
    <AppShell
      title="Visit"
      subtitle="Consent → record on this device → AI organises → you sign."
    >
      <VisitRecorder visitId={id} />
    </AppShell>
  );
}
