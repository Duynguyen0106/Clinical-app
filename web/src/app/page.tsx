import Link from "next/link";
import { BRAND, DEMO_CLINIC } from "@/modules/config/brand";
import { BrandLogo } from "@/components/BrandLogo";

export default function HomePage() {
  return (
    <div className="home">
      <nav className="home-nav">
        <BrandLogo variant="mark" className="nav-mark" priority />
        <div className="home-cta">
          <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-ghost">
            Book as patient
          </Link>
          <Link href="/login" className="btn-primary">
            Clinic sign in
          </Link>
        </div>
      </nav>

      <section className="home-hero home-hero-brand">
        <div className="home-hero-copy">
          <BrandLogo variant="full" className="home-logo" priority />
          <p className="brand-motto">{BRAND.motto}</p>
          <p className="lede">{BRAND.tagline}</p>
          <div className="home-cta">
            <Link href="/login" className="btn-primary">
              Open clinic
            </Link>
            <Link href={`/book/${DEMO_CLINIC.slug}`} className="btn-secondary">
              Online booking
            </Link>
          </div>
        </div>
        <div className="home-hero-plane" aria-hidden>
          <div className="home-hero-glow" />
          <p className="home-hero-flow">Consent → Record → Sign</p>
        </div>
      </section>
    </div>
  );
}
