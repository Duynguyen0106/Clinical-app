import Link from "next/link";
import Image from "next/image";
import {
  Mic,
  ShieldCheck,
  Sparkles,
  PenLine,
  CalendarDays,
  Banknote,
  Users,
  Clock,
  Globe2,
  Lock,
  Smartphone,
} from "lucide-react";
import { BRAND, DEMO_CLINIC, LAUNCH } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";

const LOOP = [
  {
    step: "01",
    title: "Consent",
    line: "Capture recording consent on the visit — logged and auditable.",
    Icon: ShieldCheck,
  },
  {
    step: "02",
    title: "Record",
    line: "Ambient audio on phone, tablet, or laptop during the session.",
    Icon: Mic,
  },
  {
    step: "03",
    title: "Organise",
    line: "AI drafts into your MSK template — physio, osteo, or manual therapy.",
    Icon: Sparkles,
  },
  {
    step: "04",
    title: "Sign",
    line: "Review, sign, and mark the invoice without reopening the chart.",
    Icon: PenLine,
  },
] as const;

const FEATURES = [
  {
    title: "Visit-first notes",
    line: "One screen from consent to signed note — built for the room, not the desk.",
    Icon: Mic,
  },
  {
    title: "MSK templates",
    line: "Structured drafts mapped to your discipline templates and practice pulse.",
    Icon: Sparkles,
  },
  {
    title: "Online booking",
    line: "Public book page, deposits, and patient self-manage links for your website.",
    Icon: CalendarDays,
  },
  {
    title: "Waitlist & reminders",
    line: "Offer cancelled slots, SMS reminders, and reception workflows.",
    Icon: Clock,
  },
  {
    title: "Money in GBP",
    line: "Mark-paid invoices, receipts, and team pay summaries in one place.",
    Icon: Banknote,
  },
  {
    title: "UK privacy controls",
    line: "Retention, export, and audit tools — designed for clinic compliance.",
    Icon: Lock,
  },
] as const;

const ROLES = [
  { role: "Owner", email: "alex@northbank.example" },
  { role: "Practitioner", email: "jordan@northbank.example" },
  { role: "Reception", email: "reception@northbank.example" },
] as const;

const TRUST = [
  { label: `${LAUNCH.country} clinics`, detail: `${LAUNCH.timezone} · ${LAUNCH.currency}` },
  { label: "EU-ready hosting", detail: "Neon Postgres · Vercel EU" },
  { label: "Installable app", detail: "PWA + native shells" },
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
          <a href="#visit">Visit loop</a>
          <a href="#features">Features</a>
          <a href="#demo">Demo</a>
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

        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <p className="landing-pill">{BRAND.motto}</p>
            <BrandLogo variant="clear" className="landing-logo" priority />
            <h1 className="landing-headline">
              Clinical notes that keep pace with the visit.
            </h1>
            <p className="landing-lede">{BRAND.tagline}</p>
            <ul className="landing-disciplines" aria-label="Disciplines">
              {DEMO_CLINIC.disciplines.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <div className="landing-cta">
              <Link href="/login" className="btn-primary">
                Open clinic demo
              </Link>
              <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
                Try online booking
              </Link>
            </div>
          </div>

          <aside className="landing-hero-panel" aria-label="Today at a glance">
            <p className="landing-panel-label">Clinic pulse</p>
            <p className="landing-panel-clinic">{DEMO_CLINIC.name}</p>
            <dl className="landing-panel-stats">
              <div>
                <dt>Today</dt>
                <dd>6 visits</dd>
              </div>
              <div>
                <dt>Unsigned</dt>
                <dd>2 notes</dd>
              </div>
              <div>
                <dt>Waitlist</dt>
                <dd>3 offers</dd>
              </div>
              <div>
                <dt>Collected</dt>
                <dd>{LAUNCH.currencySymbol}420</dd>
              </div>
            </dl>
            <p className="landing-panel-flow">Consent → Record → Organise → Sign</p>
          </aside>
        </div>
      </section>

      <div className="landing-trust" aria-label="Trust and region">
        {TRUST.map((item) => (
          <div key={item.label} className="landing-trust-item">
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>

      <section
        id="visit"
        className="landing-section landing-loop"
        aria-labelledby="loop-heading"
      >
        <p className="landing-eyebrow">The visit</p>
        <h2 id="loop-heading">From mic to signed note in one loop.</h2>
        <p className="landing-support">
          Built for the day-of clinic rhythm — not another evening of typing at
          home.
        </p>
        <ol className="landing-steps">
          {LOOP.map((item, i) => (
            <li
              key={item.step}
              className="landing-step"
              style={{ animationDelay: `${120 + i * 90}ms` }}
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
        id="features"
        className="landing-section landing-features"
        aria-labelledby="features-heading"
      >
        <p className="landing-eyebrow">Everything else</p>
        <h2 id="features-heading">The full clinic day, still calm.</h2>
        <p className="landing-support">
          Diary, waitlist, team pay, and money — without switching systems
          between the treatment room and reception.
        </p>
        <ul className="landing-feature-grid">
          {FEATURES.map((item, i) => (
            <li
              key={item.title}
              className="landing-feature-card"
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <span className="landing-feature-icon" aria-hidden>
                <item.Icon size={22} strokeWidth={1.75} />
              </span>
              <strong>{item.title}</strong>
              <span>{item.line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section landing-day" aria-labelledby="day-heading">
        <div className="landing-day-copy">
          <p className="landing-eyebrow">The clinic day</p>
          <h2 id="day-heading">One place for your whole team.</h2>
          <p className="landing-support">
            Owners see money and compliance. Practitioners run visits and sign
            notes. Reception manages the diary, waitlist, and new patient intake
            — all on the same calm surface.
          </p>
          <ul className="landing-day-list">
            <li>
              <Users size={18} strokeWidth={1.75} aria-hidden />
              Owner, practitioner, and reception roles
            </li>
            <li>
              <Globe2 size={18} strokeWidth={1.75} aria-hidden />
              Embed booking on your website
            </li>
            <li>
              <Smartphone size={18} strokeWidth={1.75} aria-hidden />
              Works in the browser or as an installable app
            </li>
          </ul>
          <Link href="/login" className="btn-secondary">
            Sign in to the demo
          </Link>
        </div>
        <div className="landing-day-visual" aria-hidden>
          <div className="landing-mock">
            <div className="landing-mock-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="landing-mock-body">
              <div className="landing-mock-row landing-mock-row-head">
                <span>Today</span>
                <span className="landing-mock-badge">Live</span>
              </div>
              <div className="landing-mock-row">
                <span>09:00 · Initial MSK</span>
                <span className="landing-mock-muted">Room 1</span>
              </div>
              <div className="landing-mock-row landing-mock-row-active">
                <span>10:30 · Follow-up</span>
                <span className="landing-mock-badge">Recording</span>
              </div>
              <div className="landing-mock-row">
                <span>11:45 · New patient</span>
                <span className="landing-mock-muted">Deposit paid</span>
              </div>
              <div className="landing-mock-divider" />
              <div className="landing-mock-row landing-mock-row-foot">
                <span>Unsigned notes</span>
                <strong>2</strong>
              </div>
              <div className="landing-mock-row landing-mock-row-foot">
                <span>Waitlist offers</span>
                <strong>3</strong>
              </div>
            </div>
          </div>
          <p className="landing-day-meta">
            {DEMO_CLINIC.name} · {DEMO_CLINIC.disciplines.join(" · ")}
          </p>
        </div>
      </section>

      <section
        id="demo"
        className="landing-close"
        aria-labelledby="close-heading"
      >
        <div className="landing-close-inner">
          <p className="landing-eyebrow">Try it now</p>
          <h2 id="close-heading">Ready when your clinic is.</h2>
          <p>
            Explore the live demo on{" "}
            <strong>{DEMO_CLINIC.name}</strong>. Password{" "}
            <code>treow-demo</code> for all staff accounts below.
          </p>
          <ul className="landing-demo-roles">
            {ROLES.map((r) => (
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
            <Link href="/privacy" className="btn-ghost">
              Privacy notice
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
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Sign in</Link>
          <Link href={`/book/${DEMO_CLINIC.slug}`}>Book</Link>
          <Link href="/embed/northbank-manual">Embed booking</Link>
        </nav>
      </footer>
    </div>
  );
}
