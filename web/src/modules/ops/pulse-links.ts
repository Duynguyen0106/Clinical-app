/**
 * Practice pulse deep-links — keep UI and API in sync.
 */

export type PulseMetricLink = {
  id: string;
  label: string;
  href: string;
};

/** Stable metric → destination for Today pulse cells. */
export const PULSE_METRIC_LINKS: PulseMetricLink[] = [
  { id: "utilisation", label: "Utilisation", href: "/app/calendar" },
  { id: "rebook", label: "Rebook", href: "/app/patients" },
  { id: "unsigned", label: "Unsigned", href: "/app/notes?status=DRAFT" },
  { id: "unpaid", label: "Unpaid", href: "/app/money?status=unpaid" },
  { id: "mix", label: "New / return", href: "/app/patients" },
];

export function pulseLinksPayload() {
  return Object.fromEntries(
    PULSE_METRIC_LINKS.map((m) => [m.id, m.href]),
  ) as Record<PulseMetricLink["id"], string>;
}
