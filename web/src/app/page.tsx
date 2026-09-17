import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  ClipboardList,
  ShieldCheck,
  Wallet,
  LayoutDashboard,
  Mic,
  Sparkles,
  PenLine,
  Globe2,
  DoorOpen,
  Hourglass,
  Lock,
  Users,
  Bell,
} from "lucide-react";
import { BRAND, DEMO_CLINIC, LAUNCH } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";

const PILLARS = [
  {
    id: "booking",
    title: "Diary & online booking",
    line: "Staff calendar, website embed, waitlist, rooms, and your services.",
    Icon: CalendarDays,
  },
  {
    id: "notes",
    title: "Clinical notes",
    line: "Record the visit. Treow drafts into MSK templates you can sign.",
    Icon: ClipboardList,
  },
  {
    id: "money",
    title: "Money in GBP",
    line: "Invoices, deposits, receipts, and team pay summaries.",
    Icon: Wallet,
  },
  {
    id: "ops",
    title: "Clinic day",
    line: "Today view, tasks, team leave, and reception workflows.",
    Icon: LayoutDashboard,
  },
  {
    id: "team",
    title: "Team & patients",
    line: "Practitioners, availability, patient prep, and prior notes.",
    Icon: Users,
  },
  {
    id: "trust",
    title: "UK trust",
    line: "Europe/London, consent audits, retention, EU-ready hosting.",
    Icon: ShieldCheck,
  },
] as const;

const LOOP = [
  {
    step: "01",
    title: "Book",
    line: "Patients book from your website; reception fills the diary.",
    Icon: Globe2,
  },
  {
    step: "02",
    title: "Consent & record",
    line: "Capture recording consent, then record the visit in the room.",
    Icon: Mic,
  },
  {
    step: "03",
    title: "Organise",
    line: "AI drafts into physio, osteopathy, or manual therapy templates.",
    Icon: Sparkles,
  },
  {
    step: "04",
    title: "Sign & bill",
    line: "Review, sign, rebook, and mark the invoice without leaving the visit.",
    Icon: PenLine,
  },
] as const;

const WHY = [
  {
    title: "Replace the tool sprawl",
    line: "Diary, notes, money, and booking in one login — fewer hand-offs and fewer mistakes.",
  },
  {
    title: "Win patients from your website",
    line: "Book button or iframe that syncs to the same diary reception and practitioners use.",
  },
  {
    title: "Shorter evenings after clinic",
    line: "Record the visit; Treow drafts into MSK templates you review and sign.",
  },
  {
    title: "Hosted, updated, UK-minded",
    line: "We run the cloud app. Europe/London, GBP, privacy controls — no IT project for upgrades.",
  },
] as const;

const DEMO_ROLES = [
  { role: "Owner", email: "alex@northbank.example" },
  { role: "Practitioner", email: "jordan@northbank.example" },
  { role: "Reception", email: "reception@northbank.example" },
] as const;

export default function HomePage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="landing-nav-brand" aria-label={BRAND.name}>
          <BrandLogo variant="mark" className="nav-mark" priority />
          <span className="brand-word">{BRAND.shortName}</span>
        </Link>
        <nav className="landing-nav-links" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#why">Why Treow</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="landing-nav-cta">
          <Link href="/login" className="btn-ghost">
            Try the demo
          </Link>
          <a href="#pilot" className="btn-primary">
            Start a pilot
          </a>
        </div>
      </header>

      <section className="landing-hero" aria-label={BRAND.name}>
        <div className="landing-hero-media" aria-hidden>
          <Image
            src="/brand/landing-hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="landing-hero-img"
          />
          <div className="landing-hero-veil" />
        </div>
        <div className="landing-hero-copy">
          <BrandLogo variant="clear" className="landing-logo" priority />
          <p className="landing-eyebrow landing-eyebrow-on-hero">
            Full clinic management · UK allied health
          </p>
          <h1 className="landing-headline">
            One system for the whole clinic — not another booking bolt-on.
          </h1>
          <p className="landing-lede">
            Attract patients online, run the diary, finish notes faster, and keep
            money in GBP — all hosted for your physio, osteopathy, or manual
            therapy practice.
          </p>
          <div className="landing-cta">
            <a href="#pilot" className="btn-primary">
              Start a pilot
            </a>
            <Link href="/login" className="btn-secondary">
              Explore the live demo
            </Link>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="landing-pillars"
        aria-labelledby="pillars-heading"
      >
        <div className="landing-pillars-inner">
          <p className="landing-eyebrow">Full clinic platform</p>
          <h2 id="pillars-heading">
            Everything your clinic needs — not just a booking widget.
          </h2>
          <p className="landing-support">
            Built for physio, osteopathy, and manual therapy in the{" "}
            {LAUNCH.country}: {LAUNCH.timezone}, {LAUNCH.currency}, and a product
            surface owners, practitioners, and reception can share.
          </p>
          <ul className="landing-pillar-list">
            {PILLARS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${
                    item.id === "notes"
                      ? "how-it-works"
                      : item.id === "trust"
                        ? "uk-trust"
                        : item.id === "booking"
                          ? "booking"
                          : "features"
                  }`}
                >
                  <span className="landing-pillar-icon" aria-hidden>
                    <item.Icon size={22} strokeWidth={1.75} />
                  </span>
                  <strong>{item.title}</strong>
                  <span>{item.line}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="how-it-works"
        className="landing-section landing-loop"
        aria-labelledby="loop-heading"
      >
        <p className="landing-eyebrow">Clinical notes</p>
        <h2 id="loop-heading">From booking to signed note in one loop.</h2>
        <p className="landing-support">
          Patients book online. Your team runs the visit. Treow drafts the note
          so paperwork does not steal the evening.
        </p>
        <ol className="landing-steps">
          {LOOP.map((item, i) => (
            <li
              key={item.step}
              className="landing-step"
              style={{ animationDelay: `${100 + i * 80}ms` }}
            >
              <span className="landing-step-icon" aria-hidden>
                <item.Icon size={20} strokeWidth={1.75} />
              </span>
              <span className="landing-step-num">{item.step}</span>
              <strong>{item.title}</strong>
              <span>{item.line}</span>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="booking"
        className="landing-band landing-band-mist"
        aria-labelledby="booking-heading"
      >
        <div className="landing-band-grid">
          <div className="landing-band-copy">
            <p className="landing-eyebrow">Diary &amp; website</p>
            <h2 id="booking-heading">
              Online booking that belongs to your clinic system.
            </h2>
            <p className="landing-support">
              Embed on WordPress, Squarespace, or Wix. Parallel practitioners,
              day-first availability, deposits, rooms, and waitlist — all synced
              to the same diary your staff use.
            </p>
            <ul className="landing-check-list">
              <li>
                <Globe2 size={16} strokeWidth={1.75} aria-hidden />
                Book button or iframe from Settings
              </li>
              <li>
                <DoorOpen size={16} strokeWidth={1.75} aria-hidden />
                Rooms and waitlist without fake diary users
              </li>
              <li>
                <Bell size={16} strokeWidth={1.75} aria-hidden />
                Reminders and patient manage links
              </li>
              <li>
                <Hourglass size={16} strokeWidth={1.75} aria-hidden />
                Notice windows you control
              </li>
            </ul>
            <div className="landing-cta">
              <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
                Try patient booking
              </Link>
              <Link href={`/embed/${DEMO_CLINIC.slug}`} className="btn-ghost">
                Preview embed
              </Link>
            </div>
          </div>
          <div className="landing-band-visual" aria-hidden>
            <div className="landing-mock">
              <div className="landing-mock-bar">
                <span />
                <span />
                <span />
              </div>
              <div className="landing-mock-body">
                <div className="landing-mock-row landing-mock-row-head">
                  <span>This week · {DEMO_CLINIC.name}</span>
                  <span className="landing-mock-badge">Live</span>
                </div>
                <div className="landing-mock-row">
                  <span>Mon 09:00 · Initial MSK</span>
                  <span className="landing-mock-muted">45 min · £75</span>
                </div>
                <div className="landing-mock-row landing-mock-row-active">
                  <span>Mon 10:30 · Follow-up</span>
                  <span className="landing-mock-badge">In visit</span>
                </div>
                <div className="landing-mock-row">
                  <span>Tue 14:00 · Osteopathy</span>
                  <span className="landing-mock-muted">Room 2</span>
                </div>
                <div className="landing-mock-divider" />
                <div className="landing-mock-row landing-mock-row-foot">
                  <span>Unsigned notes · Waitlist</span>
                  <strong>Ready</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="money"
        className="landing-band landing-band-forest"
        aria-labelledby="money-heading"
      >
        <div className="landing-band-grid landing-band-grid-reverse">
          <div className="landing-band-copy landing-band-copy-on-dark">
            <p className="landing-eyebrow">Finance</p>
            <h2 id="money-heading">Invoices and pay that stay in GBP.</h2>
            <p className="landing-support">
              Mark visits paid, take deposits on online book, print receipts, and
              summarise team pay — without bolting on a US billing mindset.
            </p>
            <ul className="landing-check-list">
              <li>List prices on services you define</li>
              <li>Deposits and notice windows on public booking</li>
              <li>Owner staff-pay summaries from session fees</li>
            </ul>
            <Link href="/login" className="btn-primary landing-btn-on-dark">
              See money in the demo
            </Link>
          </div>
          <div className="landing-band-stat" aria-hidden>
            <p className="landing-stat-label">
              {LAUNCH.currency} · {LAUNCH.locale}
            </p>
            <p className="landing-stat-value">{LAUNCH.currencySymbol}55</p>
            <p className="landing-stat-line">Typical follow-up list price</p>
            <p className="landing-stat-meta">
              Services · deposits · mark paid · receipts
            </p>
          </div>
        </div>
      </section>

      <section
        id="why"
        className="landing-section"
        aria-labelledby="why-heading"
      >
        <p className="landing-eyebrow">Why clinics choose Treow</p>
        <h2 id="why-heading">Built for owners who want one calm product.</h2>
        <p className="landing-support">
          Stop paying for a booking widget, a notes app, and a spreadsheet.
          Treow Clinic is the practice system that carries the whole day.
        </p>
        <ul className="landing-ops-row">
          {WHY.map((item) => (
            <li key={item.title}>
              <ShieldCheck size={20} strokeWidth={1.75} aria-hidden />
              <strong>{item.title}</strong>
              <span>{item.line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="uk-trust"
        className="landing-band landing-band-trust"
        aria-labelledby="trust-heading"
      >
        <div className="landing-trust-copy">
          <p className="landing-eyebrow">Security &amp; privacy</p>
          <h2 id="trust-heading">
            Clinic records under UK-minded control.
          </h2>
          <p className="landing-support">
            Your clinic remains the data controller. We host Treow as processor —
            EU-ready Postgres, retention settings, consent for recording, and a
            privacy notice on every booking page.
          </p>
          <ul className="landing-check-list">
            <li>
              <Lock size={16} strokeWidth={1.75} aria-hidden />
              Consent before ambient recording
            </li>
            <li>
              <ShieldCheck size={16} strokeWidth={1.75} aria-hidden />
              Audit exports and staff roles
            </li>
            <li>
              <LayoutDashboard size={16} strokeWidth={1.75} aria-hidden />
              We update the product remotely — no IT project for upgrades
            </li>
          </ul>
          <Link href="/privacy" className="btn-secondary">
            Read the privacy notice
          </Link>
        </div>
      </section>

      <section
        id="pricing"
        className="landing-section landing-pricing"
        aria-labelledby="pricing-heading"
      >
        <p className="landing-eyebrow">Simple monthly pricing</p>
        <h2 id="pricing-heading">
          Price the whole practice system — not a widget.
        </h2>
        <p className="landing-support">
          One subscription covers diary, website booking, clinical notes, money,
          and team tools. Hosted and updated for you — no site-visit fees for
          product upgrades.
        </p>
        <div className="landing-price-grid">
          <article className="landing-price-card">
            <h3>Starter</h3>
            <p className="landing-price-amount">
              £79<span>/ month</span>
            </p>
            <p>Solo or small practices ready for one system.</p>
            <ul>
              <li>Full clinic app: diary, notes, booking</li>
              <li>Website button + embed</li>
              <li>Invoices &amp; deposits in GBP</li>
              <li>Email support</li>
            </ul>
          </article>
          <article className="landing-price-card landing-price-featured">
            <p className="landing-price-badge">Most clinics</p>
            <h3>Clinic</h3>
            <p className="landing-price-amount">
              £149<span>/ month</span>
            </p>
            <p>Busy multi-practitioner clinics.</p>
            <ul>
              <li>Everything in Starter</li>
              <li>Rooms, waitlist, staff pay</li>
              <li>Team leave &amp; reception tools</li>
              <li>Priority onboarding</li>
            </ul>
          </article>
          <article className="landing-price-card">
            <h3>Group</h3>
            <p className="landing-price-amount">Custom</p>
            <p>Multi-site groups and chains.</p>
            <ul>
              <li>Unlimited practitioners</li>
              <li>Guided rollout &amp; training</li>
              <li>SLA support</li>
            </ul>
          </article>
        </div>
        <p className="landing-support landing-price-note">
          Start with a guided pilot. Upgrade when the clinic day is running on
          Treow. Cancel anytime from Billing once Stripe is connected.
        </p>
      </section>

      <section
        id="pilot"
        className="landing-section landing-pilot"
        aria-labelledby="pilot-heading"
      >
        <p className="landing-eyebrow">Design partners</p>
        <h2 id="pilot-heading">Pilot the full clinic system with us.</h2>
        <p className="landing-support">
          We provision your clinic, owner login, website booking snippets, and a
          guided pilot. Run real appointments on Treow — we ship improvements
          remotely from your feedback.
        </p>
        <div className="landing-cta">
          <a
            className="btn-primary"
            href="mailto:ops@northbank.example?subject=Treow%20Clinic%20pilot"
          >
            Email to start a pilot
          </a>
          <Link href="/login" className="btn-secondary">
            Explore the demo first
          </Link>
        </div>
      </section>

      <section
        id="demo"
        className="landing-close"
        aria-labelledby="demo-heading"
      >
        <div className="landing-close-inner">
          <p className="landing-eyebrow">Live demo</p>
          <h2 id="demo-heading">
            Try {DEMO_CLINIC.name} — the full clinic day.
          </h2>
          <p>
            Sign in as owner, practitioner, or reception. Password{" "}
            <code>treow-demo</code>. Same roles you would run on a busy day —
            diary, notes, money, and patient booking included.
          </p>
          <ul className="landing-demo-roles">
            {DEMO_ROLES.map((r) => (
              <li key={r.role}>
                <span className="landing-demo-role">{r.role}</span>
                <code>{r.email}</code>
              </li>
            ))}
          </ul>
          <div className="landing-cta">
            <Link href="/login" className="btn-primary">
              Clinic sign in
            </Link>
            <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
              Book as patient
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        <BrandLogo variant="mark" className="nav-mark" />
        <p>
          {BRAND.name} · {BRAND.motto}
        </p>
        <nav aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#pilot">Pilot</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Sign in</Link>
          <Link href={`/book/${DEMO_CLINIC.slug}`}>Book</Link>
          <Link href={`/embed/${DEMO_CLINIC.slug}`}>Embed</Link>
        </nav>
      </footer>
    </div>
  );
}
