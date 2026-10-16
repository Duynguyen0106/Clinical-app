/** Active statuses that occupy a practitioner's diary slot. */
const OCCUPYING = new Set([
  "BOOKED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
]);

/** Weekly open-hours rule (0=Sun … 6=Sat), clinic-local minutes. */
export type AvailabilityRule = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

/** Fallback when a practitioner has no weekly hours configured. */
export const DEFAULT_DIARY_RULES: AvailabilityRule[] = [1, 2, 3, 4, 5].map(
  (dayOfWeek) => ({
    dayOfWeek,
    startMinute: 8 * 60,
    endMinute: 18 * 60,
  }),
);

export function rulesForPractitioner(
  rules: AvailabilityRule[] | null | undefined,
): AvailabilityRule[] {
  return rules && rules.length > 0 ? rules : DEFAULT_DIARY_RULES;
}

/**
 * Whether an hour cell (e.g. 09:00–10:00) sits inside weekly open hours.
 * Matches staff booking: a slot starting at `hour:00` must be ≥ start and < end.
 */
export function isHourWithinRules(
  dayOfWeek: number,
  hour: number,
  rules: AvailabilityRule[],
): boolean {
  const start = hour * 60;
  return rules.some(
    (r) =>
      r.dayOfWeek === dayOfWeek &&
      start >= r.startMinute &&
      start < r.endMinute,
  );
}

/** Hour labels to show on the diary from the union of practitioners' rules. */
export function diaryHoursFromRules(
  ruleSets: AvailabilityRule[][],
  opts: { minHour?: number; maxHour?: number } = {},
): number[] {
  const floor = opts.minHour ?? 6;
  const ceil = opts.maxHour ?? 21;
  const flat = ruleSets.flatMap((r) => rulesForPractitioner(r));
  if (flat.length === 0) {
    return Array.from({ length: 10 }, (_, i) => 8 + i);
  }
  let minH = Math.min(...flat.map((r) => Math.floor(r.startMinute / 60)));
  let maxH = Math.max(...flat.map((r) => Math.ceil(r.endMinute / 60) - 1));
  minH = Math.max(floor, Math.min(minH, 8));
  maxH = Math.min(ceil, Math.max(maxH, 17));
  if (maxH < minH) return [minH];
  return Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
}

export function appointmentOccupiesSlot(status: string): boolean {
  return OCCUPYING.has(status.toUpperCase());
}

/** CSS modifier for calendar event colouring by appointment status. */
export function calendarEventStatusClass(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "status-completed";
    case "NO_SHOW":
      return "status-no_show";
    case "CANCELLED":
      return "status-cancelled";
    case "CHECKED_IN":
    case "IN_PROGRESS":
      return "status-in_progress";
    case "CONFIRMED":
      return "status-confirmed";
    case "BOOKED":
    default:
      return "status-booked";
  }
}

export function humanStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "NO_SHOW":
      return "No-show";
    case "CHECKED_IN":
      return "Checked in";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "CONFIRMED":
      return "Confirmed";
    case "BOOKED":
    default:
      return "Booked";
  }
}
