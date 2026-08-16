"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Hourglass,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Settings,
  Users,
  UserRoundPlus,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND, DEMO_CLINIC } from "@/modules/config/brand";

type NavItem = {
  href: string;
  label: string;
  myDayLabel?: string;
  icon: typeof LayoutDashboard;
  clinicianOnly?: boolean;
  ownerOnly?: boolean;
  staffOps?: boolean;
};

const nav: NavItem[] = [
  { href: "/app", label: "Today", myDayLabel: "My day", icon: LayoutDashboard },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/rooms", label: "Rooms", icon: DoorOpen, staffOps: true },
  { href: "/app/team", label: "Team", icon: UserRoundPlus, ownerOnly: true },
  { href: "/app/patients", label: "Patients", icon: Users },
  { href: "/app/notes", label: "Notes", icon: ClipboardList, clinicianOnly: true },
  { href: "/app/tasks", label: "Tasks", icon: ListTodo },
  { href: "/app/waitlist", label: "Waitlist", icon: Hourglass },
  { href: "/app/money", label: "Money", icon: Wallet, staffOps: true },
  { href: "/app/settings", label: "Settings", icon: Settings, ownerOnly: true },
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
  const isClinician = me?.role === "OWNER" || me?.role === "PRACTITIONER";
  const isOwner = me?.role === "OWNER";
  const isPractitioner = me?.role === "PRACTITIONER";
  const hasDiary = Boolean(me?.practitionerProfileId);

  const visibleNav = nav.filter((item) => {
    if (item.clinicianOnly && !isClinician) return false;
    if (item.ownerOnly && !isOwner) return false;
    // Practitioners focus on clinical work — money/rooms stay with front desk / owners
    if (item.staffOps && isPractitioner) return false;
    return true;
  });

  return (
    <div className="app-shell min-h-screen">
      <aside className="app-nav">
        <Link href="/app" className="brand-block brand-block-logo">
          <BrandLogo variant="mark" className="nav-mark" />
          <div>
            <p className="brand-word">{BRAND.shortName}</p>
            <p className="brand-sub">Clinic</p>
          </div>
        </Link>
        <nav className="nav-list" aria-label="Clinic">
          {visibleNav.map((item) => {
            const { href, icon: Icon } = item;
            const label =
              href === "/app" && hasDiary && item.myDayLabel
                ? item.myDayLabel
                : item.label;
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
