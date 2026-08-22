/** Treow Clinic brand + launch defaults */
export const BRAND = {
  name: "Treow Clinic",
  shortName: "Treow",
  /** Primary brand line from the mark */
  motto: "Rooted in Osteopathy, Growing in Health",
  tagline:
    "Record the visit — Treow organises the clinical note so you can sign and move on.",
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

/** Demo tenant shown in the scaffold UI */
export const DEMO_CLINIC = {
  name: "Northbank Manual Therapy",
  slug: "northbank-manual",
  practitioner: "Alex Nguyen",
  disciplines: ["Physiotherapy", "Osteopathy", "Manual therapy"] as const,
} as const;
