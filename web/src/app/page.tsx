import Link from "next/link";
import { BRAND, DEMO_CLINIC } from "@/modules/config/brand";

export default function HomePage() {
  return (
    <div className="home">
      <nav className="home-nav">
        <div className="brand-block">
          <p className="brand-mark">{BRAND.shortName}</p>
          <p className="brand-sub">Clinic</p>
        </div>
        <div className="home-cta">
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-ghost">
            Book as patient
          </Link>
          <Link href="/login" className="btn-primary">
            Clinic sign in
          </Link>
        </div>
      </nav>
      <section className="home-hero">
        <h1>{BRAND.shortName}</h1>
        <p className="lede">{BRAND.tagline}</p>
        <div className="home-cta">
          <Link href="/login" className="btn-primary">
            Open clinic
          </Link>
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
            Online booking
          </Link>
        </div>
        <div
          className="home-visual"
          role="img"
          aria-label="Consultation recording visual"
        />
      </section>
    </div>
  );
}
