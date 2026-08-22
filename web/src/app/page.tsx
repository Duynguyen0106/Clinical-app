import Link from "next/link";
import Image from "next/image";
import { BRAND, DEMO_CLINIC } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";

const LOOP = [
  { step: "01", title: "Consent", line: "Capture recording consent on the visit." },
  { step: "02", title: "Record", line: "Ambient audio on phone or laptop." },
  { step: "03", title: "Organise", line: "AI drafts into your MSK template." },
  { step: "04", title: "Sign", line: "Review, sign, then mark the invoice." },
] as const;

export default function HomePage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="landing-nav-brand" aria-label={BRAND.name}>
          <BrandLogo variant="mark" className="nav-mark" priority />
          <span className="brand-word">{BRAND.shortName}</span>
        </Link>
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

        <div className="landing-hero-copy">
          <BrandLogo variant="clear" className="landing-logo" priority />
          <h1 className="landing-headline">
            Clinical notes that keep pace with the visit.
          </h1>
          <p className="landing-lede">
            Record once. Treow organises a draft into your physio, osteopathy, or
            manual therapy template — so you can sign and move on.
          </p>
          <div className="landing-cta">
            <Link href="/login" className="btn-primary">
              Open clinic
            </Link>
            <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
              Try online booking
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section landing-loop" aria-labelledby="loop-heading">
        <p className="landing-eyebrow">The visit</p>
        <h2 id="loop-heading">From mic to signed note in one loop.</h2>
        <p className="landing-support">
          Built for the day-of clinic rhythm — not another evening of typing.
        </p>
        <ol className="landing-steps">
          {LOOP.map((item, i) => (
            <li
              key={item.step}
              className="landing-step"
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <span className="landing-step-num">{item.step}</span>
              <strong>{item.title}</strong>
              <span>{item.line}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-day" aria-labelledby="day-heading">
        <div className="landing-day-copy">
          <p className="landing-eyebrow">The clinic day</p>
          <h2 id="day-heading">Diary, waitlist, and money — still calm.</h2>
          <p className="landing-support">
            Today view, week calendar, waitlist offers on cancel, unsigned-note
            tasks, and mark-paid invoices in GBP. UK privacy controls sit in
            Settings.
          </p>
          <Link href="/login" className="btn-secondary">
            Sign in to the demo
          </Link>
        </div>
        <div className="landing-day-visual" aria-hidden>
          <p className="landing-day-flow">Today → Visit → Sign → Paid</p>
          <p className="landing-day-meta">
            {DEMO_CLINIC.name} · {DEMO_CLINIC.disciplines.join(" · ")}
          </p>
        </div>
      </section>

      <section className="landing-close" aria-labelledby="close-heading">
        <h2 id="close-heading">Ready when your clinic is.</h2>
        <p>
          Demo password <code>treow-demo</code> — owner, practitioner, and
          reception accounts on Northbank Manual Therapy.
        </p>
        <div className="landing-cta">
          <Link href="/login" className="btn-primary">
            Clinic sign in
          </Link>
          <Link href="/privacy" className="btn-ghost">
            Privacy notice
          </Link>
        </div>
      </section>

      <footer className="landing-foot">
        <BrandLogo variant="mark" className="nav-mark" />
        <p>
          {BRAND.name} · {BRAND.motto}
        </p>
        <nav>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Sign in</Link>
          <Link href={`/book/${DEMO_CLINIC.slug}`}>Book</Link>
        </nav>
      </footer>
    </div>
  );
}
