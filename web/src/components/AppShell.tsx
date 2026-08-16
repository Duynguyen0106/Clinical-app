import Link from "next/link";
import { CalendarDays, ClipboardList, LayoutDashboard, Users, Wallet } from "lucide-react";

const nav = [
  { href: "/app", label: "Today", icon: LayoutDashboard },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/patients", label: "Patients", icon: Users },
  { href: "/app/notes", label: "Notes", icon: ClipboardList },
  { href: "/app/money", label: "Money", icon: Wallet },
];

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="app-shell min-h-screen">
      <aside className="app-nav">
        <div className="brand-block">
          <p className="brand-mark">Aether</p>
          <p className="brand-sub">Clinic</p>
        </div>
        <nav className="nav-list" aria-label="Clinic">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="nav-link">
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="nav-footer">
          <p className="nav-clinic">Harbour Physio</p>
          <p className="nav-user">Alex Nguyen</p>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="app-subtitle">{subtitle}</p> : null}
          </div>
          <Link href="/book/harbour-physio" className="btn-ghost">
            Patient booking →
          </Link>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
