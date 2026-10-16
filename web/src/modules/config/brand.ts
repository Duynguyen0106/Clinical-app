/**
 * Treow Clinic — full practice management for UK allied-health clinics.
 * Online booking is included; the product is the whole clinic day.
 */
export const BRAND = {
  name: "Treow Clinic",
  shortName: "Treow",
  motto: "Rooted in Osteopathy, Growing in Health",
  tagline:
    "The full clinic management system for UK physio, osteopathy, and manual therapy — diary, online booking, clinical notes, and money in one calm hosted app.",
  logo: {
    full: "/brand/treow-logo.png",
    mark: "/brand/treow-mark.png",
    trim: "/brand/treow-logo-trim.png",
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

/** Interactive demo tenant prospects can sign into */
export const DEMO_CLINIC = {
  name: "Northbank Manual Therapy",
  slug: "northbank-manual",
  practitioner: "Alex Nguyen",
  disciplines: ["Physiotherapy", "Osteopathy", "Manual therapy"] as const,
} as const;

/**
 * Whether login/landing may advertise demo emails + `treow-demo`.
 * Production is off unless NEXT_PUBLIC_DEMO_LOGIN=true (staging demos only).
 */
export function showDemoLoginCredentials() {
  const flag = process.env.NEXT_PUBLIC_DEMO_LOGIN?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}
