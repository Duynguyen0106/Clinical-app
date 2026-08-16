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
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND, DEMO_CLINIC } from "@/modules/config/brand";
import { getToken } from "@/lib/api";

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
  { href: "/app/team", label: "Team", icon: UserRoundPlus, clinicianOnly: true },
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
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | null>(null);
  const clinicName = me?.clinic.name ?? DEMO_CLINIC.name;
  const userName = me?.user.name ?? DEMO_CLINIC.practitioner;
  const bookHref = `/book/${me?.clinic.slug ?? DEMO_CLINIC.slug}`;
  const isClinician = me?.role === "OWNER" || me?.role === "PRACTITIONER";
  const isOwner = me?.role === "OWNER";
  const isPractitioner = me?.role === "PRACTITIONER";
  const hasDiary = Boolean(me?.practitionerProfileId);

  useEffect(() => {
    if (!me?.clinic.hasLogo) {
      setClinicLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = getToken();
    void fetch("/api/v1/clinic/logo", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return null;
        return URL.createObjectURL(await res.blob());
      })
      .then((url) => {
        if (cancelled || !url) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setClinicLogoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [me?.clinic.hasLogo, me?.clinic.id]);

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
          {clinicLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL
            <img
              src={clinicLogoUrl}
              alt=""
              className="nav-clinic-logo"
            />
          ) : (
            <BrandLogo variant="mark" className="nav-mark" />
          )}
          <div>
            <p className="brand-word">{clinicName}</p>
            <p className="brand-sub">{BRAND.shortName}</p>
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
