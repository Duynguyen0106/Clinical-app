import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { withClinicTransaction } from "@/server/clinic-rls";
import { notFound } from "@/server/errors";

type Tx = Prisma.TransactionClient;

export type PatientMatch = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  /** Why this row matched */
  match: "email" | "phone";
};

export function normaliseEmail(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase() ?? "";
  return v || null;
}

/** UK-friendly E.164-ish normalisation (same rules as SMS). */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  return digits;
}

/** Digits-only form for loose DB compare when stored values vary. */
export function phoneDigits(raw: string | null | undefined): string | null {
  const n = normalisePhone(raw);
  if (!n) return null;
  const d = n.replace(/\D/g, "");
  return d || null;
}

const matchSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
} as const;

/**
 * Clinic-scoped, non-archived matches. Email wins over phone when both hit.
 * Ranked: email matches first, then phone-only.
 */
export async function findMatchingPatients(
  clinicId: string,
  input: { email?: string | null; phone?: string | null },
  client: PrismaClient | Tx = prisma,
): Promise<PatientMatch[]> {
  const email = normaliseEmail(input.email);
  const phone = normalisePhone(input.phone);
  const digits = phoneDigits(input.phone);
  if (!email && !phone) return [];

  const rows = await client.patient.findMany({
    where: {
      clinicId,
      archivedAt: null,
      OR: [
        ...(email
          ? [{ email: { equals: email, mode: "insensitive" as const } }]
          : []),
        ...(phone ? [{ phone }] : []),
        // Also catch 07… stored forms when we normalised to +44…
        ...(digits && digits.length >= 10
          ? [
              {
                phone: {
                  contains: digits.slice(-10),
                },
              },
            ]
          : []),
      ],
    },
    select: matchSelect,
    take: 20,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const scored: PatientMatch[] = [];
  for (const row of rows) {
    const emailHit =
      Boolean(email) &&
      normaliseEmail(row.email) === email;
    const phoneHit =
      Boolean(digits) &&
      (normalisePhone(row.phone) === phone ||
        (phoneDigits(row.phone)?.endsWith(digits!.slice(-10)) ?? false));
    if (!emailHit && !phoneHit) continue;
    scored.push({
      ...row,
      match: emailHit ? "email" : "phone",
    });
  }

  scored.sort((a, b) => {
    if (a.match !== b.match) return a.match === "email" ? -1 : 1;
    return `${a.lastName}${a.firstName}`.localeCompare(
      `${b.lastName}${b.firstName}`,
    );
  });

  // Dedupe by id (email+phone OR can double-hit)
  const seen = new Set<string>();
  return scored.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export type ResolvePatientInput = {
  clinicId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  alerts?: string | null;
  /** When set, skip match/create and load this patient (rebook token). */
  forcedPatientId?: string;
};

export type ResolvePatientResult = {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    alerts: string | null;
  };
  outcome: "reused" | "created" | "forced";
};

/**
 * Public-book identity: force id, else match email/phone, else create.
 * Fills missing phone on reuse only — never overwrites demographics/alerts.
 */
export async function resolveOrCreatePatient(
  input: ResolvePatientInput,
): Promise<ResolvePatientResult> {
  const email = normaliseEmail(input.email);
  const phone = normalisePhone(input.phone);

  return withClinicTransaction(input.clinicId, async (tx) => {
    if (input.forcedPatientId) {
      const forced = await tx.patient.findFirst({
        where: {
          id: input.forcedPatientId,
          clinicId: input.clinicId,
          archivedAt: null,
        },
      });
      if (!forced) {
        throw notFound("Rebook patient not found");
      }
      let row = forced;
      if (!row.phone && phone) {
        row = await tx.patient.update({
          where: { id: row.id },
          data: { phone },
        });
      }
      console.info(
        `[patient:forced] clinic=${input.clinicId} patient=${row.id}`,
      );
      return { patient: row, outcome: "forced" as const };
    }

    const matches = await findMatchingPatients(
      input.clinicId,
      { email, phone },
      tx,
    );
    let row = matches[0]
      ? await tx.patient.findFirstOrThrow({ where: { id: matches[0].id } })
      : null;

    if (!row) {
      row = await tx.patient.create({
        data: {
          clinicId: input.clinicId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email: email,
          phone,
          alerts: input.alerts || null,
        },
      });
      console.info(
        `[patient:created] clinic=${input.clinicId} patient=${row.id}`,
      );
      return { patient: row, outcome: "created" as const };
    }

    if (!row.phone && phone) {
      row = await tx.patient.update({
        where: { id: row.id },
        data: { phone },
      });
    }
    console.info(
      `[patient:reused] clinic=${input.clinicId} patient=${row.id} via=${matches[0]?.match}`,
    );
    return { patient: row, outcome: "reused" as const };
  });
}
