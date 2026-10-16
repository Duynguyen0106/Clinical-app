import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Calendar date YYYY-MM-DD in the clinic timezone. */
export function clinicDateKey(date: Date, timeZone: string) {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

/**
 * JS day-of-week (0=Sun … 6=Sat) in the clinic timezone.
 * date-fns `i` is ISO day (1=Mon … 7=Sun).
 */
export function clinicDayOfWeek(date: Date, timeZone: string) {
  const iso = Number(formatInTimeZone(date, timeZone, "i"));
  return iso === 7 ? 0 : iso;
}

/** Minutes from local midnight in the clinic timezone. */
export function clinicMinutesFromMidnight(date: Date, timeZone: string) {
  const hours = Number(formatInTimeZone(date, timeZone, "H"));
  const minutes = Number(formatInTimeZone(date, timeZone, "m"));
  return hours * 60 + minutes;
}

/** UTC Date for a clinic-local civil date + minutes-from-midnight. */
export function clinicLocalDateTime(
  dateKey: string,
  minuteOfDay: number,
  timeZone: string,
) {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const wall = `${dateKey}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  return fromZonedTime(wall, timeZone);
}

/** YYYY-MM-DD for Prisma `@db.Date` values (stored as UTC midnight). */
export function utcDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
