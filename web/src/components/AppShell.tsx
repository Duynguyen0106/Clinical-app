"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { BRAND, DEMO_CLINIC } from "@/modules/config/brand";

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
  const { me, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const clinicName = me?.clinic.name ?? DEMO_CLINIC.name;
  const userName = me?.user.name ?? DEMO_CLINIC.practitioner;
  const bookHref = `/book/${me?.clinic.slug ?? DEMO_CLINIC.slug}`;

  return (
    <div className="app-shell min-h-screen">
      <aside className="app-nav">
        <div className="brand-block">
          <p className="brand-mark">{BRAND.shortName}</p>
          <p className="brand-sub">Clinic</p>
        </div>
        <nav className="nav-list" aria-label="Clinic">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/app" ? pathname === "/app" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`nav-link ${active ? "active" : ""}`}
              >
                <Icon size={18} aria-hidden />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="nav-footer">
          <p className="nav-clinic">{clinicName}</p>
          <p className="nav-user">{userName}</p>
          <button
            type="button"
            className="btn-ghost btn-sm logout-btn"
            onClick={() =>
              void logout().then(() => {
                router.push("/login");
              })
            }
          >
            <LogOut size={14} aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="app-subtitle">{subtitle}</p> : null}
          </div>
          <Link href={bookHref} className="btn-ghost">
            Patient booking →
          </Link>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
