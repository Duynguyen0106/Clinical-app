import { AppShell } from "@/components/AppShell";

export default function NotesPage() {
  return (
    <AppShell
      title="Notes"
      subtitle="Drafts waiting for signature appear here."
    >
      <div className="panel empty-panel">
        <h2>No unsigned drafts</h2>
        <p className="muted">
          When you stop a recording, organised notes land here until you sign
          them.
        </p>
      </div>
    </AppShell>
  );
}
