import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Calendar date YYYY-MM-DD in the clinic timezone. */
export function clinicDateKey(date: Date, timeZone: string) {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

/** Clinic-local midnight for the civil day containing `date`. */
export function startOfClinicDay(date: Date, timeZone: string) {
  return clinicLocalDateTime(clinicDateKey(date, timeZone), 0, timeZone);
}

/**
 * Monday 00:00 clinic-local for the ISO week containing `date`
 * (week starts Monday, matching the staff diary).
 */
export function startOfClinicWeek(date: Date, timeZone: string) {
  const key = clinicDateKey(date, timeZone);
  const dow = clinicDayOfWeek(date, timeZone); // 0=Sun … 6=Sat
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const [y, m, d] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - daysFromMonday);
  return clinicLocalDateTime(utc.toISOString().slice(0, 10), 0, timeZone);
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

/**
 * Add whole calendar days in the clinic timezone, keeping the same local
 * wall-clock time (safe across UK DST — unlike raw `7 * 24h` ms math).
 */
export function addClinicCalendarDays(
  date: Date,
  days: number,
  timeZone: string,
) {
  const key = clinicDateKey(date, timeZone);
  const minutes = clinicMinutesFromMidnight(date, timeZone);
  const [y, m, d] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  const newKey = utc.toISOString().slice(0, 10);
  return clinicLocalDateTime(newKey, minutes, timeZone);
}
