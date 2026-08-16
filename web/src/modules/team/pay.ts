import { z } from "zod";
import {
  AppointmentStatus,
  EmploymentType,
  PractitionerPayMode,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { requireRole } from "@/server/auth";
import { badRequest, notFound } from "@/server/errors";

export const upsertPayRateSchema = z
  .object({
    employmentType: z.nativeEnum(EmploymentType),
    payMode: z.nativeEnum(PractitionerPayMode),
    sessionRateCents: z.number().int().min(0).nullable().optional(),
    dayRateCents: z.number().int().min(0).nullable().optional(),
    feeSharePercent: z.number().int().min(0).max(100).nullable().optional(),
    /** YYYY-MM-DD — defaults to today (UTC) */
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    notes: z.string().max(400).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.payMode === PractitionerPayMode.SESSION &&
      (v.sessionRateCents == null || v.sessionRateCents < 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Session rate required for session pay",
        path: ["sessionRateCents"],
      });
    }
    if (
      v.payMode === PractitionerPayMode.DAY &&
      (v.dayRateCents == null || v.dayRateCents < 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Day rate required for day pay",
        path: ["dayRateCents"],
      });
    }
    if (
      v.payMode === PractitionerPayMode.FEE_SHARE &&
      (v.feeSharePercent == null || v.feeSharePercent < 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fee share % required for fee-share pay",
        path: ["feeSharePercent"],
      });
    }
  });

function parseDateOnly(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw badRequest("month must be YYYY-MM");
  }
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { from, to };
}

const BILLABLE: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
];

type RateRow = {
  id: string;
  employmentType: EmploymentType;
  payMode: PractitionerPayMode;
  sessionRateCents: number | null;
  dayRateCents: number | null;
  feeSharePercent: number | null;
  effectiveFrom: Date;
  notes: string | null;
};

function pickRateForDate(rates: RateRow[], day: Date): RateRow | null {
  const key = utcDateKey(day);
  let best: RateRow | null = null;
  for (const r of rates) {
    if (utcDateKey(r.effectiveFrom) <= key) {
      if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
    }
  }
  return best;
}

function serializeRate(r: RateRow) {
  return {
    id: r.id,
    employmentType: r.employmentType,
    payMode: r.payMode,
    sessionRateCents: r.sessionRateCents,
    dayRateCents: r.dayRateCents,
    feeSharePercent: r.feeSharePercent,
    effectiveFrom: utcDateKey(r.effectiveFrom),
    notes: r.notes,
  };
}

function sessionFeeCents(apt: {
  invoices: { amountCents: number; status: string }[];
  appointmentType: { defaultPriceCents: number };
}) {
  const invoiceTotal = apt.invoices
    .filter((i) => i.status !== "VOID")
    .reduce((s, i) => s + i.amountCents, 0);
  return invoiceTotal > 0 ? invoiceTotal : apt.appointmentType.defaultPriceCents;
}

async function loadPractitionerOrThrow(ctx: AuthContext, id: string) {
  const profile = await prisma.practitionerProfile.findFirst({
    where: { id, membership: { clinicId: ctx.clinicId } },
    select: {
      id: true,
      displayName: true,
      colour: true,
      active: true,
      professionalTitle: true,
    },
  });
  if (!profile) throw notFound("Practitioner not found");
  return profile;
}

export async function getPractitionerPay(
  ctx: AuthContext,
  practitionerId: string,
) {
  requireRole(ctx, ["OWNER"]);
  const profile = await loadPractitionerOrThrow(ctx, practitionerId);
  const rates = await prisma.practitionerPayRate.findMany({
    where: { practitionerId: profile.id },
    orderBy: { effectiveFrom: "desc" },
  });
  return {
    practitioner: profile,
    current: rates[0] ? serializeRate(rates[0]) : null,
    history: rates.map(serializeRate),
  };
}

export async function upsertPractitionerPay(
  ctx: AuthContext,
  practitionerId: string,
  input: z.infer<typeof upsertPayRateSchema>,
) {
  requireRole(ctx, ["OWNER"]);
  const profile = await loadPractitionerOrThrow(ctx, practitionerId);
  const effectiveFrom = parseDateOnly(
    input.effectiveFrom ?? utcDateKey(new Date()),
  );

  const data = {
    employmentType: input.employmentType,
    payMode: input.payMode,
    sessionRateCents:
      input.payMode === PractitionerPayMode.SESSION
        ? (input.sessionRateCents ?? 0)
        : null,
    dayRateCents:
      input.payMode === PractitionerPayMode.DAY
        ? (input.dayRateCents ?? 0)
        : null,
    feeSharePercent:
      input.payMode === PractitionerPayMode.FEE_SHARE
        ? (input.feeSharePercent ?? 0)
        : null,
    notes: input.notes?.trim() || null,
  };

  const rate = await prisma.practitionerPayRate.upsert({
    where: {
      practitionerId_effectiveFrom: {
        practitionerId: profile.id,
        effectiveFrom,
      },
    },
    create: {
      practitionerId: profile.id,
      effectiveFrom,
      ...data,
    },
    update: data,
  });

  return {
    practitioner: profile,
    rate: serializeRate(rate),
  };
}

function computeDue(
  rates: RateRow[],
  sessions: {
    startsAt: Date;
    invoices: { amountCents: number; status: string }[];
    appointmentType: { defaultPriceCents: number };
  }[],
) {
  let dueCents = 0;
  let feeBaseCents = 0;
  const dayKeys = [...new Set(sessions.map((a) => utcDateKey(a.startsAt)))].sort();

  for (const day of dayKeys) {
    const daySessions = sessions.filter((a) => utcDateKey(a.startsAt) === day);
    const rate = pickRateForDate(rates, parseDateOnly(day));
    if (!rate || rate.payMode === PractitionerPayMode.NONE) continue;

    if (rate.payMode === PractitionerPayMode.DAY) {
      dueCents += rate.dayRateCents ?? 0;
      continue;
    }

    if (rate.payMode === PractitionerPayMode.SESSION) {
      dueCents += daySessions.length * (rate.sessionRateCents ?? 0);
      continue;
    }

    if (rate.payMode === PractitionerPayMode.FEE_SHARE) {
      const pct = rate.feeSharePercent ?? 0;
      for (const apt of daySessions) {
        const fee = sessionFeeCents(apt);
        feeBaseCents += fee;
        dueCents += Math.round((fee * pct) / 100);
      }
    }
  }

  return {
    sessionCount: sessions.length,
    dayCount: dayKeys.length,
    feeBaseCents,
    dueCents,
  };
}

export async function listStaffPaySummary(ctx: AuthContext, month: string) {
  requireRole(ctx, ["OWNER"]);
  const { from, to } = monthBounds(month);

  const practitioners = await prisma.practitionerProfile.findMany({
    where: { membership: { clinicId: ctx.clinicId } },
    select: {
      id: true,
      displayName: true,
      colour: true,
      active: true,
      professionalTitle: true,
      payRates: { orderBy: { effectiveFrom: "asc" } },
    },
    orderBy: { displayName: "asc" },
  });

  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      status: { in: BILLABLE },
      startsAt: { gte: from, lte: to },
    },
    include: {
      appointmentType: { select: { defaultPriceCents: true, name: true } },
      invoices: { select: { amountCents: true, status: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const byPractitioner = new Map<string, typeof appointments>();
  for (const apt of appointments) {
    const list = byPractitioner.get(apt.practitionerId) ?? [];
    list.push(apt);
    byPractitioner.set(apt.practitionerId, list);
  }

  const rows = practitioners.map((p) => {
    const rates = p.payRates;
    const current = rates.length ? rates[rates.length - 1]! : null;
    const sessions = byPractitioner.get(p.id) ?? [];
    const summary = computeDue(rates, sessions);

    return {
      practitioner: {
        id: p.id,
        displayName: p.displayName,
        colour: p.colour,
        active: p.active,
        professionalTitle: p.professionalTitle,
      },
      current: current ? serializeRate(current) : null,
      summary: { month, ...summary },
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.sessionCount += r.summary.sessionCount;
      acc.dueCents += r.summary.dueCents;
      return acc;
    },
    { sessionCount: 0, dueCents: 0 },
  );

  return { month, rows, totals };
}

export function staffPayCsv(
  summary: Awaited<ReturnType<typeof listStaffPaySummary>>,
) {
  const lines = [
    [
      "month",
      "practitioner",
      "employment",
      "pay_mode",
      "sessions",
      "days",
      "fee_base_gbp",
      "due_gbp",
      "session_rate_gbp",
      "day_rate_gbp",
      "fee_share_percent",
    ].join(","),
  ];
  const gbp = (pence: number | null | undefined) =>
    pence == null ? "" : (pence / 100).toFixed(2);

  for (const row of summary.rows) {
    const c = row.current;
    lines.push(
      [
        summary.month,
        csvEscape(row.practitioner.displayName),
        c?.employmentType ?? "",
        c?.payMode ?? "NONE",
        String(row.summary.sessionCount),
        String(row.summary.dayCount),
        gbp(row.summary.feeBaseCents),
        gbp(row.summary.dueCents),
        gbp(c?.sessionRateCents),
        gbp(c?.dayRateCents),
        c?.feeSharePercent == null ? "" : String(c.feeSharePercent),
      ].join(","),
    );
  }
  lines.push(
    [
      summary.month,
      "TOTAL",
      "",
      "",
      String(summary.totals.sessionCount),
      "",
      "",
      gbp(summary.totals.dueCents),
      "",
      "",
      "",
    ].join(","),
  );
  return `${lines.join("\n")}\n`;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
