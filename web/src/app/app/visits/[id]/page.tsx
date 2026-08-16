import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VisitRecorder } from "@/components/VisitRecorder";
import { getAppointment } from "@/modules/demo/data";

type Props = { params: Promise<{ id: string }> };

export default async function VisitPage({ params }: Props) {
  const { id } = await params;
  const apt = getAppointment(id);
  if (!apt) notFound();

  return (
    <AppShell
      title="Visit"
      subtitle="Record → AI organises the note → you review and sign."
    >
      <VisitRecorder
        appointmentId={apt.id}
        patientName={apt.patientName}
        appointmentType={apt.type}
      />
    </AppShell>
  );
}
