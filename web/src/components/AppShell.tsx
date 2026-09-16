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
  Menu,
  MoreHorizontal,
  Settings,
  Stethoscope,
  Users,
  UserRoundPlus,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
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
  /** Show in the phone bottom tab bar */
  mobileTab?: boolean;
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
        mobileTab: true,
      },
      {
        href: "/app/calendar",
        label: "Calendar",
        scheduleLabel: "Schedule",
        icon: CalendarDays,
        mobileTab: true,
      },
      { href: "/app/patients", label: "Patients", icon: Users, mobileTab: true },
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

function itemLabel(
  item: NavItem,
  opts: { hasDiary: boolean; isPractitioner: boolean },
) {
  if (item.href === "/app" && opts.hasDiary && item.myDayLabel) {
    return item.myDayLabel;
  }
  if (
    item.href === "/app/calendar" &&
    opts.isPractitioner &&
    item.scheduleLabel
  ) {
    return item.scheduleLabel;
  }
  return item.label;
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
  const menuId = useId();
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

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

  const flatItems = visibleGroups.flatMap((g) => g.items);
  const mobileTabs = flatItems.filter((item) => item.mobileTab);
  const labelOpts = { hasDiary, isPractitioner };
  const moreActive =
    menuOpen ||
    flatItems.some(
      (item) => !item.mobileTab && isNavActive(pathname, item.href),
    );

  function renderNavLinks(onNavigate?: () => void) {
    return visibleGroups.map((group) => (
      <div key={group.id} className="nav-group">
        <p className="nav-group-label">{group.label}</p>
        {group.items.map((item) => {
          const { href, icon: Icon } = item;
          const label = itemLabel(item, labelOpts);
          const active = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-link ${active ? "active" : ""}`}
              onClick={onNavigate}
            >
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    ));
  }

  return (
    <div className={`app-shell min-h-screen${menuOpen ? " menu-open" : ""}`}>
      <aside className="app-nav app-nav-desktop" aria-label="Clinic">
        <Link href="/app" className="brand-block brand-block-logo">
          {clinicLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL
            <img src={clinicLogoUrl} alt="" className="nav-clinic-logo" />
          ) : (
            <BrandLogo variant="mark" className="nav-mark" />
          )}
          <div>
            <p className="brand-word">{clinicName}</p>
            <p className="brand-sub">{BRAND.shortName}</p>
          </div>
        </Link>
        <nav className="nav-list">{renderNavLinks()}</nav>
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
          <div className="app-header-lead">
            <button
              type="button"
              className="mobile-menu-btn"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            </button>
            <div className="app-header-copy">
              <h1>{title}</h1>
              {subtitle ? <p className="app-subtitle">{subtitle}</p> : null}
            </div>
          </div>
          {!isPractitioner ? (
            <Link href={bookHref} className="btn-ghost app-header-booking">
              Patient booking →
            </Link>
          ) : null}
        </header>
        <main className="app-content">{children}</main>
      </div>

      <nav className="mobile-tabbar" aria-label="Primary">
        {mobileTabs.map((item) => {
          const Icon = item.icon;
          const label = itemLabel(item, labelOpts);
          const active = !menuOpen && isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-tab ${active ? "active" : ""}`}
            >
              <Icon size={20} aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`mobile-tab ${moreActive ? "active" : ""}`}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal size={20} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {menuOpen ? (
        <div className="mobile-drawer-root">
          <button
            type="button"
            className="mobile-drawer-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id={menuId}
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Clinic menu"
          >
            <div className="mobile-drawer-head">
              <div className="brand-block brand-block-logo">
                {clinicLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL
                  <img src={clinicLogoUrl} alt="" className="nav-clinic-logo" />
                ) : (
                  <BrandLogo variant="mark" className="nav-mark" />
                )}
                <div>
                  <p className="brand-word">{clinicName}</p>
                  <p className="brand-sub">{BRAND.shortName}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setMenuOpen(false)}
              >
                <X size={16} aria-hidden /> Close
              </button>
            </div>
            <nav className="nav-list mobile-drawer-nav">
              {renderNavLinks(() => setMenuOpen(false))}
            </nav>
            <div className="nav-footer mobile-drawer-footer">
              <p className="nav-clinic">{clinicName}</p>
              <p className="nav-user">{userName}</p>
              {!isPractitioner ? (
                <Link
                  href={bookHref}
                  className="btn-secondary btn-sm"
                  onClick={() => setMenuOpen(false)}
                >
                  Patient booking →
                </Link>
              ) : null}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
