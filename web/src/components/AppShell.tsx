"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
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
import { api } from "@/lib/api";

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
      {
        href: "/app/patients",
        label: "Patients",
        icon: Users,
        /** Reception: mobile tab; clinicians swap this for Notes */
        mobileTab: true,
      },
      {
        href: "/app/notes",
        label: "Notes",
        icon: ClipboardList,
        clinicianOnly: true,
        /** Clinicians: Notes is a phone tab (Patients moves under More) */
        mobileTab: true,
      },
    ],
  },
  {
    id: "desk",
    label: "Desk",
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
      {
        href: "/app/team",
        label: "Team",
        icon: UserRoundPlus,
      },
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
      {
        href: "/app/billing",
        label: "Clinic plan",
        icon: CreditCard,
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
  /** Badge on More for pending desk work (tasks + leave) */
  const [moreBadge, setMoreBadge] = useState(0);
  const [leavePending, setLeavePending] = useState(0);
  const clinicName = me?.clinic.name ?? DEMO_CLINIC.name;
  const userName = me?.user.name ?? DEMO_CLINIC.practitioner;
  const bookHref = `/book/${me?.clinic.slug ?? DEMO_CLINIC.slug}`;
  const isClinician = me?.role === "OWNER" || me?.role === "PRACTITIONER";
  const isOwner = me?.role === "OWNER";
  const isPractitioner = me?.role === "PRACTITIONER";
  const canReviewLeave = isOwner || me?.role === "RECEPTION";
  const hasDiary = Boolean(me?.practitionerProfileId);

  // Use the authenticated logo URL directly so the browser can cache it
  // (avoid blob re-fetch + resolveAuth on every AppShell mount).
  useEffect(() => {
    if (!me?.clinic.hasLogo) {
      setClinicLogoUrl(null);
      return;
    }
    setClinicLogoUrl(me.clinic.logoUrl ?? "/api/v1/clinic/logo");
  }, [me?.clinic.hasLogo, me?.clinic.logoUrl, me?.clinic.id]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!me) {
      setMoreBadge(0);
      setLeavePending(0);
      return;
    }
    let cancelled = false;
    const taskJob = !isPractitioner
      ? api<{ tasks: unknown[] }>("/ops/tasks")
          .then((d) => d.tasks.length)
          .catch(() => 0)
      : Promise.resolve(0);
    const leaveJob = canReviewLeave
      ? api<{ requests: unknown[] }>("/leave-requests?pending=1")
          .then((d) => d.requests.length)
          .catch(() => 0)
      : isPractitioner && me.practitionerProfileId
        ? api<{ requests: Array<{ status: string }> }>(
            `/leave-requests?practitionerId=${me.practitionerProfileId}`,
          )
            .then(
              (d) => d.requests.filter((r) => r.status === "PENDING").length,
            )
            .catch(() => 0)
        : Promise.resolve(0);
    void Promise.all([taskJob, leaveJob]).then(([tasks, leave]) => {
      if (cancelled) return;
      setLeavePending(leave);
      setMoreBadge(tasks + leave);
    });
    return () => {
      cancelled = true;
    };
  }, [me, isPractitioner, canReviewLeave, pathname]);

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
  /** Role-aware: clinicians get Notes on phone; reception keeps Patients. */
  function isMobileTabItem(item: NavItem) {
    if (!item.mobileTab) return false;
    if (item.href === "/app/notes") return isClinician;
    if (item.href === "/app/patients") return !isClinician;
    return true;
  }
  /** Cap at 3 destinations + More (= 4) so the bar never wraps */
  const mobileTabs = flatItems.filter(isMobileTabItem).slice(0, 3);
  const labelOpts = { hasDiary, isPractitioner };
  const moreActive =
    menuOpen ||
    flatItems.some(
      (item) => !isMobileTabItem(item) && isNavActive(pathname, item.href),
    );

  function renderNavLinks(onNavigate?: () => void) {
    return visibleGroups.map((group) => (
      <div key={group.id} className="nav-group">
        <p className="nav-group-label">{group.label}</p>
        {group.items.map((item) => {
          const href =
            item.href === "/app/team" && leavePending > 0
              ? "/app/team?tab=leave"
              : item.href;
          const { icon: Icon } = item;
          const label = itemLabel(item, labelOpts);
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
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
          <span className="mobile-tab-icon-wrap">
            <MoreHorizontal size={20} aria-hidden />
            {moreBadge > 0 ? (
              <span className="mobile-tab-badge" aria-label={`${moreBadge} items need attention`}>
                {moreBadge > 9 ? "9+" : moreBadge}
              </span>
            ) : null}
          </span>
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
