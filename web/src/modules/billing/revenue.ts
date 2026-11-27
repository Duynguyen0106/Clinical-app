import { z } from "zod";
import {
  DepositStatus,
  InvoiceStatus,
} from "@/generated/prisma/client";
import { requireRole, type AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { AppError, badRequest } from "@/server/errors";
import {
  addClinicCalendarDays,
  clinicDateKey,
  clinicLocalDateTime,
} from "@/modules/scheduling/clinic-time";
import { formatInTimeZone } from "date-fns-tz";

/** Search-param empty strings → undefined so optional fields stay optional. */
const optionalYmd = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
);

const optionalYm = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
);

const optionalYear = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
);

export const revenueQuerySchema = z.object({
  preset: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["day", "month", "year", "custom"]).default("day"),
  ),
  /** YYYY-MM-DD — used by day preset */
  date: optionalYmd,
  /** YYYY-MM — used by month preset */
  month: optionalYm,
  /** YYYY — used by year preset */
  year: optionalYear,
  /** YYYY-MM-DD inclusive — custom */
  from: optionalYmd,
  /** YYYY-MM-DD inclusive — custom */
  to: optionalYmd,
});

export type RevenueQuery = z.infer<typeof revenueQuerySchema>;

export type RevenuePeriodBounds = {
  preset: RevenueQuery["preset"];
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
  label: string;
  timeZone: string;
};

const MAX_CUSTOM_DAYS = 366;
/** Cap breakdown row scan (totals still use SQL aggregate). */
const MAX_PAYMENT_ROWS = 5000;

function parseYmd(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) throw badRequest("Invalid date");
  return { y, m, d };
}

function nextMonthKey(month: string) {
  const [y, m] = month.split("-").map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${nextY}-${String(nextM).padStart(2, "0")}`;
}

function daysBetweenKeys(fromKey: string, toKey: string) {
  const a = parseYmd(fromKey);
  const b = parseYmd(toKey);
  const fromUtc = Date.UTC(a.y, a.m - 1, a.d);
  const toUtc = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((toUtc - fromUtc) / 86_400_000) + 1;
}

/** Clinic-local midnight, or 400 if the civil date does not exist. */
function clinicDayStart(dateKey: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw badRequest("Date must be YYYY-MM-DD");
  }
  const { y, m, d } = parseYmd(dateKey);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw badRequest("Invalid date");
  }
  try {
    const from = clinicLocalDateTime(dateKey, 0, timeZone);
    if (Number.isNaN(from.getTime())) {
      throw badRequest("Invalid date");
    }
    // Reject overflows like 2026-02-31 → rolled calendar day
    if (clinicDateKey(from, timeZone) !== dateKey) {
      throw badRequest("Invalid date");
    }
    return from;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw badRequest("Invalid date");
  }
}

function clinicMonthStart(month: string, timeZone: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw badRequest("month must be YYYY-MM");
  }
  const m = Number(month.slice(5, 7));
  if (m < 1 || m > 12) throw badRequest("month must be YYYY-MM");
  return clinicDayStart(`${month}-01`, timeZone);
}

/**
 * Resolve inclusive clinic-local civil dates into a half-open UTC range
 * `[from, to)` for Prisma filters.
 */
export function resolveRevenuePeriod(
  input: RevenueQuery,
  timeZone: string,
  now = new Date(),
): RevenuePeriodBounds {
  const preset = input.preset;

  if (preset === "day") {
    const fromKey = input.date ?? clinicDateKey(now, timeZone);
    const from = clinicDayStart(fromKey, timeZone);
    const to = addClinicCalendarDays(from, 1, timeZone);
    const label = formatInTimeZone(from, timeZone, "d MMMM yyyy");
    return {
      preset,
      from,
      to,
      fromKey,
      toKey: fromKey,
      label,
      timeZone,
    };
  }

  if (preset === "month") {
    const month = input.month ?? clinicDateKey(now, timeZone).slice(0, 7);
    const from = clinicMonthStart(month, timeZone);
    const fromKey = `${month}-01`;
    const to = clinicMonthStart(nextMonthKey(month), timeZone);
    const toKey = clinicDateKey(
      addClinicCalendarDays(to, -1, timeZone),
      timeZone,
    );
    const label = formatInTimeZone(from, timeZone, "MMMM yyyy");
    return { preset, from, to, fromKey, toKey, label, timeZone };
  }

  if (preset === "year") {
    const year = input.year ?? clinicDateKey(now, timeZone).slice(0, 4);
    if (!/^\d{4}$/.test(year)) throw badRequest("year must be YYYY");
    const yNum = Number(year);
    if (yNum < 2000 || yNum > 2100) {
      throw badRequest("year must be between 2000 and 2100");
    }
    const fromKey = `${year}-01-01`;
    const from = clinicDayStart(fromKey, timeZone);
    const to = clinicDayStart(`${yNum + 1}-01-01`, timeZone);
    const toKey = `${year}-12-31`;
    return {
      preset,
      from,
      to,
      fromKey,
      toKey,
      label: year,
      timeZone,
    };
  }

  // custom
  const fromKey = input.from;
  const toKey = input.to;
  if (!fromKey || !toKey) {
    throw badRequest("Custom period requires from and to (YYYY-MM-DD)");
  }
  if (fromKey > toKey) {
    throw badRequest("from must be on or before to");
  }
  const span = daysBetweenKeys(fromKey, toKey);
  if (span > MAX_CUSTOM_DAYS) {
    throw badRequest(`Custom period cannot exceed ${MAX_CUSTOM_DAYS} days`);
  }
  const from = clinicDayStart(fromKey, timeZone);
  const toExclusive = addClinicCalendarDays(
    clinicDayStart(toKey, timeZone),
    1,
    timeZone,
  );
  const label =
    fromKey === toKey
      ? formatInTimeZone(from, timeZone, "d MMMM yyyy")
      : `${formatInTimeZone(from, timeZone, "d MMM yyyy")} – ${formatInTimeZone(
          clinicDayStart(toKey, timeZone),
          timeZone,
          "d MMM yyyy",
        )}`;
  return {
    preset,
    from,
    to: toExclusive,
    fromKey,
    toKey,
    label,
    timeZone,
  };
}

type Bucket = { amountCents: number; count: number };

function bump(
  map: Map<string, Bucket>,
  key: string,
  amountCents: number,
) {
  const cur = map.get(key) ?? { amountCents: 0, count: 0 };
  cur.amountCents += amountCents;
  cur.count += 1;
  map.set(key, cur);
}

function methodLabel(method: string) {
  switch (method) {
    case "cash":
      return "Cash";
    case "card_terminal":
      return "Card terminal";
    case "bank_transfer":
      return "Bank transfer";
    case "other":
      return "Other";
    default:
      return method.replaceAll("_", " ");
  }
}

export async function getRevenueReport(
  ctx: AuthContext,
  raw: RevenueQuery,
) {
  requireRole(ctx, ["OWNER"]);

  const clinic = await prisma.clinic.findUnique({
    where: { id: ctx.clinicId },
    select: { timezone: true },
  });
  const timeZone = clinic?.timezone || "Europe/London";
  const period = resolveRevenuePeriod(raw, timeZone);

  const paymentWhere = {
    paidAt: { gte: period.from, lt: period.to },
    invoice: { clinicId: ctx.clinicId },
  };

  const [paymentAgg, payments, depositAgg, unpaidAgg] = await Promise.all([
    prisma.payment.aggregate({
      where: paymentWhere,
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: paymentWhere,
      select: {
        amountCents: true,
        method: true,
        paidAt: true,
        invoice: {
          select: {
            appointment: {
              select: {
                practitionerId: true,
                practitioner: { select: { displayName: true } },
                appointmentTypeId: true,
                appointmentType: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { paidAt: "asc" },
      take: MAX_PAYMENT_ROWS,
    }),
    prisma.appointment.aggregate({
      where: {
        clinicId: ctx.clinicId,
        depositStatus: DepositStatus.PAID,
        depositPaidAt: { gte: period.from, lt: period.to },
      },
      _sum: { depositCents: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: {
        clinicId: ctx.clinicId,
        status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT] },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);

  const paymentCount = paymentAgg._count._all;
  const collectedCents = paymentAgg._sum.amountCents ?? 0;
  const truncated = paymentCount > payments.length;

  const byMethodMap = new Map<string, Bucket>();
  const byDayMap = new Map<string, Bucket>();
  const byMonthMap = new Map<string, Bucket>();
  const byPractitionerMap = new Map<
    string,
    Bucket & { displayName: string }
  >();
  const byServiceMap = new Map<string, Bucket & { name: string }>();

  for (const p of payments) {
    bump(byMethodMap, p.method || "other", p.amountCents);

    const dayKey = clinicDateKey(p.paidAt, timeZone);
    bump(byDayMap, dayKey, p.amountCents);
    bump(byMonthMap, dayKey.slice(0, 7), p.amountCents);

    const apt = p.invoice.appointment;
    if (apt) {
      const pracKey = apt.practitionerId;
      const existing = byPractitionerMap.get(pracKey) ?? {
        amountCents: 0,
        count: 0,
        displayName: apt.practitioner.displayName,
      };
      existing.amountCents += p.amountCents;
      existing.count += 1;
      byPractitionerMap.set(pracKey, existing);

      const svcKey = apt.appointmentTypeId;
      const svc = byServiceMap.get(svcKey) ?? {
        amountCents: 0,
        count: 0,
        name: apt.appointmentType.name,
      };
      svc.amountCents += p.amountCents;
      svc.count += 1;
      byServiceMap.set(svcKey, svc);
    } else {
      const svc = byServiceMap.get("_none") ?? {
        amountCents: 0,
        count: 0,
        name: "No linked appointment",
      };
      svc.amountCents += p.amountCents;
      svc.count += 1;
      byServiceMap.set("_none", svc);

      const prac = byPractitionerMap.get("_none") ?? {
        amountCents: 0,
        count: 0,
        displayName: "Unassigned",
      };
      prac.amountCents += p.amountCents;
      prac.count += 1;
      byPractitionerMap.set("_none", prac);
    }
  }

  const depositsCents = depositAgg._sum.depositCents ?? 0;
  const outstandingCents = unpaidAgg._sum.amountCents ?? 0;

  const byMethod = [...byMethodMap.entries()]
    .map(([method, b]) => ({
      method,
      label: methodLabel(method),
      amountCents: b.amountCents,
      count: b.count,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const byDay = [...byDayMap.entries()]
    .map(([date, b]) => ({
      date,
      amountCents: b.amountCents,
      count: b.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byMonth = [...byMonthMap.entries()]
    .map(([month, b]) => ({
      month,
      amountCents: b.amountCents,
      count: b.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byPractitioner = [...byPractitionerMap.entries()]
    .map(([practitionerId, b]) => ({
      practitionerId: practitionerId === "_none" ? null : practitionerId,
      displayName: b.displayName,
      amountCents: b.amountCents,
      count: b.count,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const byService = [...byServiceMap.entries()]
    .map(([appointmentTypeId, b]) => ({
      appointmentTypeId:
        appointmentTypeId === "_none" ? null : appointmentTypeId,
      name: b.name,
      amountCents: b.amountCents,
      count: b.count,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  return {
    period: {
      preset: period.preset,
      from: period.fromKey,
      to: period.toKey,
      label: period.label,
      timeZone: period.timeZone,
    },
    totals: {
      collectedCents,
      paymentCount,
      depositsCents,
      depositCount: depositAgg._count._all,
      outstandingCents,
      unpaidInvoiceCount: unpaidAgg._count._all,
    },
    truncated,
    breakdownPaymentCount: payments.length,
    byMethod,
    byDay: period.preset === "year" ? [] : byDay,
    byMonth: period.preset === "year" ? byMonth : [],
    byPractitioner,
    byService,
  };
}
