/**
 * Treow brand — we sell **Treow Book** (online booking + diary).
 * **Treow Clinic** is the interactive demo that shows booking inside a full clinic day.
 */
export const BRAND = {
  /** Sellable product name */
  name: "Treow Book",
  shortName: "Treow",
  /** Demo suite name (not the commercial SKU) */
  clinicDemoName: "Treow Clinic",
  /** Primary brand line from the mark */
  motto: "Rooted in Osteopathy, Growing in Health",
  tagline:
    "Online booking and diary for UK clinics — embed on your website, staff manage the schedule in one calm app.",
  logo: {
    full: "/brand/treow-logo.png",
    mark: "/brand/treow-mark.png",
    trim: "/brand/treow-logo-trim.png",
    /** Transparent export for overlays on photography */
    clear: "/brand/treow-logo-clear.png",
  },
  colours: {
    forest: "#1E3F37",
    pine: "#16352E",
    sage: "#A3B18A",
    olive: "#5D7A5D",
    mist: "#EEF2EC",
    mistDeep: "#E2E9E3",
    ink: "#14241F",
  },
} as const;

export const LAUNCH = {
  country: "UK",
  timezone: "Europe/London",
  currency: "GBP",
  currencySymbol: "£",
  locale: "en-GB",
} as const;

/** Demo tenant used to showcase Treow Book inside a sample clinic */
export const DEMO_CLINIC = {
  name: "Northbank Manual Therapy",
  slug: "northbank-manual",
  practitioner: "Alex Nguyen",
  disciplines: ["Physiotherapy", "Osteopathy", "Manual therapy"] as const,
} as const;
