/** Treow Clinic brand + launch defaults */
export const BRAND = {
  name: "Treow Clinic",
  shortName: "Treow",
  tagline:
    "Practice management that writes the note for you. Record the visit — AI organises the clinical record.",
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
