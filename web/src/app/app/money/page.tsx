import { AppShell } from "@/components/AppShell";

export default function MoneyPage() {
  return (
    <AppShell title="Money" subtitle="Light invoicing for MVP — payments next.">
      <div className="panel empty-panel">
        <h2>Invoices</h2>
        <p className="muted">
          Create invoices from completed appointments and mark paid. Gateway
          checkout is planned after core clinical workflow is solid.
        </p>
      </div>
    </AppShell>
  );
}
