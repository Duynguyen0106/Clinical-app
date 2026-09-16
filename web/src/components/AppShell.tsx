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
  Stethoscope,
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
  scheduleLabel?: string;
  icon: typeof LayoutDashboard;
  /** OWNER or PRACTITIONER */
  clinicianOnly?: boolean;
  ownerOnly?: boolean;
  /** Hidden from PRACTITIONER (front desk / clinic setup) */
  staffOps?: boolean;
  /** Hidden from PRACTITIONER only (Team stays for leave/hours) */
  hideForPractitioner?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "clinical",
    label: "Clinical",
    items: [
      {
        href: "/app",
        label: "Today",
        myDayLabel: "My day",
        icon: LayoutDashboard,
      },
      {
        href: "/app/calendar",
        label: "Calendar",
        scheduleLabel: "Schedule",
        icon: CalendarDays,
      },
      { href: "/app/patients", label: "Patients", icon: Users },
      {
        href: "/app/notes",
        label: "Notes",
        icon: ClipboardList,
        clinicianOnly: true,
      },
    ],
  },
  {
    id: "desk",
    label: "Front desk",
    items: [
      {
        href: "/app/tasks",
        label: "Tasks",
        icon: ListTodo,
        hideForPractitioner: true,
      },
      {
        href: "/app/waitlist",
        label: "Waitlist",
        icon: Hourglass,
        hideForPractitioner: true,
      },
      { href: "/app/money", label: "Money", icon: Wallet, staffOps: true },
    ],
  },
  {
    id: "clinic",
    label: "Clinic",
    items: [
      { href: "/app/team", label: "Team", icon: UserRoundPlus },
      { href: "/app/rooms", label: "Rooms", icon: DoorOpen, staffOps: true },
      {
        href: "/app/services",
        label: "Services",
        icon: Stethoscope,
        staffOps: true,
      },
      {
        href: "/app/settings",
        label: "Settings",
        icon: Settings,
        ownerOnly: true,
      },
    ],
  },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  // Staff pay lives under Team — keep Team active on /app/team/pay
  if (href === "/app/team") {
    return pathname === "/app/team" || pathname.startsWith("/app/team/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.clinicianOnly && !isClinician) return false;
        if (item.ownerOnly && !isOwner) return false;
        if (item.staffOps && isPractitioner) return false;
        if (item.hideForPractitioner && isPractitioner) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

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
          {visibleGroups.map((group) => (
            <div key={group.id} className="nav-group">
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => {
                const { href, icon: Icon } = item;
                const label =
                  href === "/app" && hasDiary && item.myDayLabel
                    ? item.myDayLabel
                    : href === "/app/calendar" &&
                        isPractitioner &&
                        item.scheduleLabel
                      ? item.scheduleLabel
                      : item.label;
                const active = isNavActive(pathname, href);
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
            </div>
          ))}
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
          {!isPractitioner ? (
            <Link href={bookHref} className="btn-ghost">
              Patient booking →
            </Link>
          ) : null}
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
