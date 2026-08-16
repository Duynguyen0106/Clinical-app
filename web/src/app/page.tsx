import Link from "next/link";

export default function HomePage() {
  return (
    <div className="home">
      <nav className="home-nav">
        <div className="brand-block">
          <p className="brand-mark">Aether</p>
          <p className="brand-sub">Clinic</p>
        </div>
        <div className="home-cta">
          <Link href="/book/harbour-physio" className="btn-ghost">
            Book as patient
          </Link>
          <Link href="/app" className="btn-primary">
            Open clinic
          </Link>
        </div>
      </nav>
      <section className="home-hero">
        <h1>Aether</h1>
        <p className="lede">
          Practice management that writes the note for you. Record the visit —
          AI organises the clinical record. Booking stays advanced, without the
          clutter.
        </p>
        <div className="home-cta">
          <Link href="/app/visits/apt_1" className="btn-primary">
            Try AI visit demo
          </Link>
          <Link href="/app" className="btn-secondary">
            Today&apos;s schedule
          </Link>
        </div>
        <div className="home-visual" role="img" aria-label="Consultation recording visual" />
      </section>
    </div>
  );
}
