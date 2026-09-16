import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  ClipboardList,
  ShieldCheck,
  Globe2,
  DoorOpen,
  Hourglass,
  Lock,
  Link2,
  Bell,
  LayoutDashboard,
} from "lucide-react";
import { BRAND, DEMO_CLINIC, LAUNCH } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";

const PILLARS = [
  {
    id: "embed",
    title: "Website embed",
    line: "Paste a Book button or iframe — patients book on your site.",
    Icon: Globe2,
  },
  {
    id: "diary",
    title: "Staff diary",
    line: "Day and week calendar with practitioners, services, and rooms.",
    Icon: CalendarDays,
  },
  {
    id: "services",
    title: "Your services",
    line: "Lengths, GBP prices, and notice windows you control.",
    Icon: ClipboardList,
  },
  {
    id: "waitlist",
    title: "Waitlist & rooms",
    line: "Fill cancellations; book couches without fake diary users.",
    Icon: DoorOpen,
  },
  {
    id: "reminders",
    title: "Reminders",
    line: "Patients get manage links to cancel or reschedule in time.",
    Icon: Bell,
  },
  {
    id: "trust",
    title: "UK-hosted",
    line: "Europe/London defaults, privacy notice, EU-ready Postgres.",
    Icon: ShieldCheck,
  },
] as const;

const LOOP = [
  {
    step: "01",
    title: "Embed",
    line: "Copy the Book button or iframe from Settings onto your website.",
    Icon: Link2,
  },
  {
    step: "02",
    title: "Patients book",
    line: "They pick a service, practitioner, and time — including any available.",
    Icon: Globe2,
  },
  {
    step: "03",
    title: "Diary updates",
    line: "Reception and clinicians see the appointment on the shared calendar.",
    Icon: CalendarDays,
  },
  {
    step: "04",
    title: "Remind & manage",
    line: "Automatic reminders; patients cancel or reschedule within your rules.",
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
          <a href="#pricing">Pricing</a>
          <a href="#demo">Clinic demo</a>
        </nav>
        <div className="landing-nav-cta">
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-ghost">
            Try booking
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
          <p className="landing-eyebrow landing-eyebrow-on-hero">Treow Book</p>
          <h1 className="landing-headline">
            Online booking clinics can embed in minutes.
          </h1>
          <p className="landing-lede">
            Patients book from your website. Your team runs the diary in one
            calm app. We host and update everything — no clinic install.
          </p>
          <div className="landing-cta">
            <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-primary">
              Try online booking
            </Link>
            <a href="#pricing" className="btn-secondary">
              See pricing
            </a>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="landing-pillars"
        aria-labelledby="pillars-heading"
      >
        <div className="landing-pillars-inner">
          <p className="landing-eyebrow">Treow Book</p>
          <h2 id="pillars-heading">
            Everything you need to take bookings online.
          </h2>
          <p className="landing-support">
            Built for physio, osteopathy, and manual therapy clinics in the{" "}
            {LAUNCH.country} — {LAUNCH.timezone}, {LAUNCH.currency}, and website
            embeds that actually sync to the diary.
          </p>
          <ul className="landing-pillar-list">
            {PILLARS.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id === "trust" ? "uk-trust" : "how-it-works"}`}>
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
        <p className="landing-eyebrow">How it works</p>
        <h2 id="loop-heading">From your website to a booked slot.</h2>
        <p className="landing-support">
          Four steps — no developer visit, no software download on clinic PCs.
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
        <div className="landing-cta" style={{ marginTop: "1.5rem" }}>
          <Link href={`/embed/${DEMO_CLINIC.slug}`} className="btn-secondary">
            Preview the embed
          </Link>
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-ghost">
            Open the book page
          </Link>
        </div>
      </section>

      <section
        id="booking"
        className="landing-band landing-band-mist"
        aria-labelledby="booking-heading"
      >
        <div className="landing-band-grid">
          <div className="landing-band-copy">
            <p className="landing-eyebrow">For your website</p>
            <h2 id="booking-heading">A clear schedule patients can book into.</h2>
            <p className="landing-support">
              Parallel practitioners, day-first availability, deposits, and
              manage links — tuned for {LAUNCH.timezone} and {LAUNCH.currency}.
            </p>
            <ul className="landing-check-list">
              <li>Book button or iframe from Settings</li>
              <li>Any available practitioner or named clinician</li>
              <li>Same wall-clock time allowed when staff are free</li>
              <li>Cancel / reschedule within your notice windows</li>
            </ul>
            <div className="landing-cta">
              <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
                Try as a patient
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
                  <span>Book online · {DEMO_CLINIC.name}</span>
                  <span className="landing-mock-badge">Live</span>
                </div>
                <div className="landing-mock-row">
                  <span>Today · 6 morning times</span>
                  <span className="landing-mock-muted">Day picker</span>
                </div>
                <div className="landing-mock-row landing-mock-row-active">
                  <span>11:30 · 2 practitioners free</span>
                  <span className="landing-mock-badge">Selected</span>
                </div>
                <div className="landing-mock-row">
                  <span>Afternoon · Show</span>
                  <span className="landing-mock-muted">18 times</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="uk-trust"
        className="landing-band landing-band-trust"
        aria-labelledby="trust-heading"
      >
        <div className="landing-trust-copy">
          <p className="landing-eyebrow">Security &amp; privacy</p>
          <h2 id="trust-heading">Booking data under UK-minded control.</h2>
          <p className="landing-support">
            Your clinic remains the data controller. We host Treow Book as
            processor — EU-ready Postgres, retention controls, and a privacy
            notice linked from every booking page.
          </p>
          <ul className="landing-check-list">
            <li>
              <Lock size={16} strokeWidth={1.75} aria-hidden />
              Privacy consent on public booking
            </li>
            <li>
              <ShieldCheck size={16} strokeWidth={1.75} aria-hidden />
              Staff access scoped per clinic
            </li>
            <li>
              <LayoutDashboard size={16} strokeWidth={1.75} aria-hidden />
              We update the product remotely — no site visit for upgrades
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
        <h2 id="pricing-heading">Pay for booking — not a full PMS licence.</h2>
        <p className="landing-support">
          Treow Book is what you subscribe to. The full clinic demo below is for
          exploring; commercial plans cover online booking, diary, and website
          embed.
        </p>
        <div className="landing-price-grid">
          <article className="landing-price-card">
            <h3>Starter</h3>
            <p className="landing-price-amount">
              £49<span>/ month</span>
            </p>
            <p>Solo or two-practitioner clinics.</p>
            <ul>
              <li>Online booking + diary</li>
              <li>Website button + embed</li>
              <li>Email support</li>
            </ul>
          </article>
          <article className="landing-price-card landing-price-featured">
            <p className="landing-price-badge">Most clinics</p>
            <h3>Clinic</h3>
            <p className="landing-price-amount">
              £99<span>/ month</span>
            </p>
            <p>Busy multi-practitioner diaries.</p>
            <ul>
              <li>Everything in Starter</li>
              <li>Rooms, waitlist, deposits</li>
              <li>Reminders &amp; manage links</li>
              <li>Priority onboarding</li>
            </ul>
          </article>
          <article className="landing-price-card">
            <h3>Group</h3>
            <p className="landing-price-amount">Custom</p>
            <p>Multi-site booking rollouts.</p>
            <ul>
              <li>Unlimited practitioners</li>
              <li>Guided website embeds</li>
              <li>SLA support</li>
            </ul>
          </article>
        </div>
        <p className="landing-support landing-price-note">
          Hosted by us. Updated without a clinic visit. Cancel anytime from
          Billing once Stripe is connected.
        </p>
      </section>

      <section
        id="pilot"
        className="landing-section landing-pilot"
        aria-labelledby="pilot-heading"
      >
        <p className="landing-eyebrow">Design partners</p>
        <h2 id="pilot-heading">Start a Treow Book pilot.</h2>
        <p className="landing-support">
          We create your clinic tenant, owner login, and website snippets. You
          take live bookings — we update Treow Book remotely as you give
          feedback.
        </p>
        <div className="landing-cta">
          <a
            className="btn-primary"
            href="mailto:ops@northbank.example?subject=Treow%20Book%20pilot"
          >
            Email to start a pilot
          </a>
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
            Try booking first
          </Link>
        </div>
      </section>

      <section
        id="demo"
        className="landing-close"
        aria-labelledby="demo-heading"
      >
        <div className="landing-close-inner">
          <p className="landing-eyebrow">Optional product tour</p>
          <h2 id="demo-heading">
            Explore {BRAND.clinicDemoName} — our interactive demo.
          </h2>
          <p>
            {BRAND.clinicDemoName} is a sample clinic day ({DEMO_CLINIC.name}) so
            you can see Treow Book inside a fuller diary and ops surface. It is{" "}
            <strong>not</strong> the product you buy — Treow Book is.
            Password <code>treow-demo</code>.
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
            <Link href="/login" className="btn-secondary">
              Open clinic demo
            </Link>
            <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-ghost">
              Prefer patient booking
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        <BrandLogo variant="mark" className="nav-mark" />
        <p>
          {BRAND.name} · {BRAND.motto}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          {BRAND.clinicDemoName} is a demo environment for exploring the diary.
        </p>
        <nav aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#pilot">Pilot</a>
          <a href="#demo">Clinic demo</a>
          <Link href="/privacy">Privacy</Link>
          <Link href={`/book/${DEMO_CLINIC.slug}`}>Book</Link>
          <Link href={`/embed/${DEMO_CLINIC.slug}`}>Embed</Link>
        </nav>
      </footer>
    </div>
  );
}
