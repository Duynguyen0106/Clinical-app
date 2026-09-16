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
  MapPin,
} from "lucide-react";
import { BRAND, DEMO_CLINIC, LAUNCH } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";

const PILLARS = [
  {
    id: "booking",
    title: "Diary & booking",
    line: "Calendar, online book, waitlist, rooms, and your own services.",
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
    line: "Mark-paid invoices, deposits, receipts, and team pay summaries.",
    Icon: Wallet,
  },
  {
    id: "ops",
    title: "Clinic day",
    line: "Today view, unsigned-note tasks, and reception workflows.",
    Icon: LayoutDashboard,
  },
  {
    id: "trust",
    title: "UK trust",
    line: "Europe/London, consent audits, retention controls, EU-ready hosting.",
    Icon: ShieldCheck,
  },
] as const;

const LOOP = [
  {
    step: "01",
    title: "Consent",
    line: "Capture recording consent on the visit — logged for UK audits.",
    Icon: ShieldCheck,
  },
  {
    step: "02",
    title: "Record",
    line: "Ambient audio on phone, tablet, or laptop in the treatment room.",
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
    title: "Sign",
    line: "Review, sign, rebook, and mark the invoice without leaving the visit.",
    Icon: PenLine,
  },
] as const;

const BOOKING_POINTS = [
  {
    title: "Online booking & embed",
    line: "Hosted book page or site embed — synced to the diary.",
    Icon: Globe2,
  },
  {
    title: "Services you define",
    line: "Add appointment types with length and GBP price.",
    Icon: ClipboardList,
  },
  {
    title: "Rooms & waitlist",
    line: "Book couches as resources; fill cancellations from the waitlist.",
    Icon: DoorOpen,
  },
  {
    title: "Reminders & manage links",
    line: "Patients can cancel or reschedule within your notice windows.",
    Icon: Hourglass,
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
          <a href="#uk-trust">UK &amp; privacy</a>
        </nav>
        <div className="landing-nav-cta">
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-ghost">
            Book as patient
          </Link>
          <Link href="/login" className="btn-primary">
            Clinic sign in
          </Link>
        </div>
      </header>

      {/* 1. Hero — Cliniko-style care-led PMS pitch, Treow brand first */}
      <section className="landing-hero" aria-label="Treow Clinic">
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
          <h1 className="landing-headline">
            Practice software for UK clinics who care.
          </h1>
          <p className="landing-lede">
            Diary, notes, invoices, and online booking — plus a visit that
            records once and drafts the clinical note into your MSK template.
          </p>
          <div className="landing-cta">
            <Link href="/login" className="btn-primary">
              Try the clinic demo
            </Link>
            <a href="#features" className="btn-secondary">
              Explore features
            </a>
          </div>
        </div>
      </section>

      {/* 2. Feature pillars — mirrors Cliniko Features hub categories */}
      <section
        id="features"
        className="landing-pillars"
        aria-labelledby="pillars-heading"
      >
        <div className="landing-pillars-inner">
          <p className="landing-eyebrow">Everything in one place</p>
          <h2 id="pillars-heading">Built for physio, osteopathy, and manual therapy.</h2>
          <p className="landing-support">
            The calm practice OS UK clinics expect — with native visit notes so
            you are not paying for a second AI scribe.
          </p>
          <ul className="landing-pillar-list">
            {PILLARS.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id === "notes" ? "how-it-works" : item.id}`}>
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

      {/* 3. How it works — Treow differentiator (Cliniko leaves AI to connected apps) */}
      <section
        id="how-it-works"
        className="landing-section landing-loop"
        aria-labelledby="loop-heading"
      >
        <p className="landing-eyebrow">Clinical notes</p>
        <h2 id="loop-heading">From mic to signed note in one loop.</h2>
        <p className="landing-support">
          Cliniko-class calm for the diary — then Treow listens in the room so
          notes keep pace with the visit, not the evening.
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

      {/* 4. Booking deep band */}
      <section
        id="booking"
        className="landing-band landing-band-mist"
        aria-labelledby="booking-heading"
      >
        <div className="landing-band-grid">
          <div className="landing-band-copy">
            <p className="landing-eyebrow">Diary &amp; booking</p>
            <h2 id="booking-heading">A clear schedule patients can book into.</h2>
            <p className="landing-support">
              Online booking, colour-coded services, rooms, waitlist fills, and
              notice windows — tuned for {LAUNCH.timezone} and {LAUNCH.currency}.
            </p>
            <ul className="landing-point-list">
              {BOOKING_POINTS.map((p) => (
                <li key={p.title}>
                  <p.Icon size={18} strokeWidth={1.75} aria-hidden />
                  <div>
                    <strong>{p.title}</strong>
                    <span>{p.line}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="landing-cta">
              <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
                Try online booking
              </Link>
              <Link href="/login" className="btn-ghost">
                Open the diary
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
                  <span className="landing-mock-badge">Recording</span>
                </div>
                <div className="landing-mock-row">
                  <span>Tue 14:00 · Osteopathy</span>
                  <span className="landing-mock-muted">Room 2</span>
                </div>
                <div className="landing-mock-divider" />
                <div className="landing-mock-row landing-mock-row-foot">
                  <span>Waitlist offers ready</span>
                  <strong>3</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Money deep band */}
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
            <p className="landing-stat-label">{LAUNCH.currency} · {LAUNCH.locale}</p>
            <p className="landing-stat-value">{LAUNCH.currencySymbol}55</p>
            <p className="landing-stat-line">Typical follow-up list price</p>
            <p className="landing-stat-meta">
              Services · deposits · mark paid · receipts
            </p>
          </div>
        </div>
      </section>

      {/* 6. Clinic ops */}
      <section
        id="ops"
        className="landing-section"
        aria-labelledby="ops-heading"
      >
        <p className="landing-eyebrow">Clinic day</p>
        <h2 id="ops-heading">Owners, practitioners, and reception on one calm surface.</h2>
        <p className="landing-support">
          Today view, tasks for unsigned notes and unpaid invoices, rooms, and
          brand settings — without a noisy dashboard.
        </p>
        <ul className="landing-ops-row">
          <li>
            <MapPin size={20} strokeWidth={1.75} aria-hidden />
            <strong>{LAUNCH.country}-first defaults</strong>
            <span>{LAUNCH.timezone} · {LAUNCH.currency} · UK phone formats</span>
          </li>
          <li>
            <LayoutDashboard size={20} strokeWidth={1.75} aria-hidden />
            <strong>Practice pulse</strong>
            <span>Unsigned notes, waitlist, and money at a glance</span>
          </li>
          <li>
            <DoorOpen size={20} strokeWidth={1.75} aria-hidden />
            <strong>Rooms as resources</strong>
            <span>Couches booked without fake diary users</span>
          </li>
        </ul>
      </section>

      {/* 7. UK security — Cliniko “records are safe” equivalent */}
      <section
        id="uk-trust"
        className="landing-band landing-band-trust"
        aria-labelledby="trust-heading"
      >
        <div className="landing-trust-copy">
          <p className="landing-eyebrow">Security &amp; privacy</p>
          <h2 id="trust-heading">Your clinic records stay under UK-minded control.</h2>
          <p className="landing-support">
            Visit recording consent, audit exports, retention settings, and
            EU-ready Postgres hosting. Privacy is a product surface — not buried
            fine print.
          </p>
          <ul className="landing-check-list">
            <li>
              <Lock size={16} strokeWidth={1.75} aria-hidden />
              Consent captured before ambient recording
            </li>
            <li>
              <ShieldCheck size={16} strokeWidth={1.75} aria-hidden />
              Owner export of clinic audits
            </li>
            <li>
              <Globe2 size={16} strokeWidth={1.75} aria-hidden />
              Privacy notice linked from booking and the app
            </li>
          </ul>
          <Link href="/privacy" className="btn-secondary">
            Read the privacy notice
          </Link>
        </div>
      </section>

      {/* 8. Transparent try — Cliniko pricing/trial equivalent for beta */}
      <section
        id="demo"
        className="landing-close"
        aria-labelledby="demo-heading"
      >
        <div className="landing-close-inner">
          <p className="landing-eyebrow">Transparent access</p>
          <h2 id="demo-heading">Try the full UK clinic demo.</h2>
          <p>
            Explore {DEMO_CLINIC.name} with password <code>treow-demo</code>. No
            card required — same staff roles you would run on a busy day.
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
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Sign in</Link>
          <Link href={`/book/${DEMO_CLINIC.slug}`}>Book</Link>
          <Link href={`/embed/${DEMO_CLINIC.slug}`}>Embed</Link>
        </nav>
      </footer>
    </div>
  );
}
