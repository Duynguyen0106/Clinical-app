/**
 * Patient lifecycle emails — thank-you, review request, no-show follow-up,
 * optional same-day reminder. Driven by Clinic settings + cron.
 *
 * Hardenings: lookback windows, claim-before-send, per-send try/catch,
 * MARKETING consent for thank-you / review / no-show (they include rebook CTAs).
 */
import { AppointmentStatus } from "@/generated/prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/server/db";
import { getAppBaseUrl } from "@/server/env";
import { clinicDateKey } from "@/modules/scheduling/clinic-time";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import {
  buildNoShowFollowUpEmail,
  buildReviewRequestEmail,
  buildThankYouEmail,
} from "./patient-lifecycle-email";
import {
  createEmailPrefsToken,
  emailPrefsUrlForToken,
} from "./email-prefs-token";
import {
  NO_SHOW_LOOKBACK_MS,
  REVIEW_LOOKBACK_MS,
  SAME_DAY_REMINDER_COOLDOWN_MS,
  THANK_YOU_LOOKBACK_MS,
  shouldSendSameDayReminder,
} from "./patient-email-eligibility";

function formatWhen(date: Date, timezone: string) {
  try {
    return formatInTimeZone(date, timezone, "EEEE d MMMM yyyy 'at' HH:mm");
  } catch {
    return date.toISOString();
  }
}

function bookUrl(slug: string) {
  return `${getAppBaseUrl()}/book/${slug}`;
}

function prefsUrlFor(patientId: string, clinicId: string) {
  return emailPrefsUrlForToken(createEmailPrefsToken(patientId, clinicId));
}

const aptInclude = {
  patient: {
    include: {
      consents: {
        where: { type: "MARKETING", granted: true },
        take: 1,
        orderBy: { capturedAt: "desc" as const },
      },
    },
  },
  practitioner: true,
  appointmentType: true,
  clinic: true,
  room: true,
} as const;

export type PatientEmailJobResult = {
  thankYou: number;
  reviewRequest: number;
  noShowFollowUp: number;
  sameDayReminder: number;
  sent: number;
  errors: number;
};

/**
 * Claim/unclaim without per-row $transaction + RLS GUCs.
 * Cron already sweeps with app-layer clinicId filters; each interactive
 * transaction burns Neon WebSocket subrequests and trips Workers limits.
 */
async function claimMarker(
  clinicId: string,
  appointmentId: string,
  field:
    | "thankYouSentAt"
    | "reviewRequestSentAt"
    | "noShowFollowUpSentAt"
    | "sameDayReminderSentAt",
) {
  const result = await prisma.appointment.updateMany({
    where: { id: appointmentId, clinicId, [field]: null },
    data: { [field]: new Date() },
  });
  return result.count === 1;
}

async function unclaimMarker(
  clinicId: string,
  appointmentId: string,
  field:
    | "thankYouSentAt"
    | "reviewRequestSentAt"
    | "noShowFollowUpSentAt"
    | "sameDayReminderSentAt",
) {
  await prisma.appointment.updateMany({
    where: { id: appointmentId, clinicId },
    data: { [field]: null },
  });
}

export async function sendDuePatientEmails(opts: {
  clinicId?: string;
} = {}): Promise<PatientEmailJobResult> {
  const clinics = await prisma.clinic.findMany({
    where: opts.clinicId ? { id: opts.clinicId } : undefined,
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      email: true,
      timezone: true,
      sameDayReminderEnabled: true,
      sameDayReminderHours: true,
      thankYouEnabled: true,
      thankYouDelayHours: true,
      reviewRequestEnabled: true,
      reviewRequestDelayDays: true,
      reviewUrl: true,
      noShowFollowUpEnabled: true,
      noShowFollowUpDelayHours: true,
    },
  });

  const result: PatientEmailJobResult = {
    thankYou: 0,
    reviewRequest: 0,
    noShowFollowUp: 0,
    sameDayReminder: 0,
    sent: 0,
    errors: 0,
  };

  for (const clinic of clinics) {
    try {
      await sendClinicPatientEmails(clinic, result);
    } catch (err) {
      result.errors += 1;
      console.error("Patient email clinic sweep failed", clinic.id, err);
    }
  }

  result.sent =
    result.thankYou +
    result.reviewRequest +
    result.noShowFollowUp +
    result.sameDayReminder;
  return result;
}

async function sendClinicPatientEmails(
  clinic: {
    id: string;
    name: string;
    slug: string;
    phone: string | null;
    email: string | null;
    timezone: string;
    sameDayReminderEnabled: boolean;
    sameDayReminderHours: number;
    thankYouEnabled: boolean;
    thankYouDelayHours: number;
    reviewRequestEnabled: boolean;
    reviewRequestDelayDays: number;
    reviewUrl: string | null;
    noShowFollowUpEnabled: boolean;
    noShowFollowUpDelayHours: number;
  },
  result: PatientEmailJobResult,
) {
  const now = new Date();
  const BATCH = 20;

    if (clinic.thankYouEnabled) {
      const cutoff = new Date(
        now.getTime() - clinic.thankYouDelayHours * 60 * 60_000,
      );
      const oldest = new Date(now.getTime() - THANK_YOU_LOOKBACK_MS);
      const due = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: AppointmentStatus.COMPLETED,
          thankYouSentAt: null,
          endsAt: { lte: cutoff, gte: oldest },
          patient: {
            email: { not: null },
            consents: { some: { type: "MARKETING", granted: true } },
          },
        },
        include: aptInclude,
        take: BATCH,
        orderBy: { endsAt: "asc" },
      });
      for (const apt of due) {
        if (!apt.patient.email) continue;
        if (apt.patient.consents.length === 0) continue;
        const claimed = await claimMarker(clinic.id, apt.id, "thankYouSentAt");
        if (!claimed) continue;
        try {
          const content = buildThankYouEmail({
            clinicName: clinic.name,
            clinicPhone: clinic.phone,
            patientFirstName: apt.patient.firstName,
            practitionerName: apt.practitioner.displayName,
            serviceName: apt.appointmentType.name,
            whenLabel: formatWhen(apt.startsAt, clinic.timezone),
            bookAgainUrl: bookUrl(clinic.slug),
            prefsUrl: prefsUrlFor(apt.patient.id, clinic.id),
          });
          const send = await sendEmail({
            to: apt.patient.email,
            subject: content.subject,
            text: content.text,
            html: content.html,
            replyTo: clinic.email,
          });
          if (send.delivered) {
            result.thankYou += 1;
          } else {
            await unclaimMarker(clinic.id, apt.id, "thankYouSentAt");
          }
        } catch (err) {
          result.errors += 1;
          console.error("Thank-you email failed", apt.id, err);
          await unclaimMarker(clinic.id, apt.id, "thankYouSentAt");
        }
      }
    }

    if (clinic.reviewRequestEnabled && clinic.reviewUrl?.trim()) {
      const cutoff = new Date(
        now.getTime() - clinic.reviewRequestDelayDays * 24 * 60 * 60_000,
      );
      const oldest = new Date(now.getTime() - REVIEW_LOOKBACK_MS);
      const due = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: AppointmentStatus.COMPLETED,
          reviewRequestSentAt: null,
          endsAt: { lte: cutoff, gte: oldest },
          patient: {
            email: { not: null },
            consents: { some: { type: "MARKETING", granted: true } },
          },
        },
        include: aptInclude,
        take: BATCH,
        orderBy: { endsAt: "asc" },
      });
      for (const apt of due) {
        if (!apt.patient.email) continue;
        if (apt.patient.consents.length === 0) continue;
        const claimed = await claimMarker(
          clinic.id,
          apt.id,
          "reviewRequestSentAt",
        );
        if (!claimed) continue;
        try {
          const content = buildReviewRequestEmail({
            clinicName: clinic.name,
            patientFirstName: apt.patient.firstName,
            practitionerName: apt.practitioner.displayName,
            reviewUrl: clinic.reviewUrl.trim(),
            prefsUrl: prefsUrlFor(apt.patient.id, clinic.id),
          });
          const send = await sendEmail({
            to: apt.patient.email,
            subject: content.subject,
            text: content.text,
            html: content.html,
            replyTo: clinic.email,
          });
          if (send.delivered) {
            result.reviewRequest += 1;
          } else {
            await unclaimMarker(clinic.id, apt.id, "reviewRequestSentAt");
          }
        } catch (err) {
          result.errors += 1;
          console.error("Review request email failed", apt.id, err);
          await unclaimMarker(clinic.id, apt.id, "reviewRequestSentAt");
        }
      }
    }

    if (clinic.noShowFollowUpEnabled) {
      const cutoff = new Date(
        now.getTime() - clinic.noShowFollowUpDelayHours * 60 * 60_000,
      );
      const oldest = new Date(now.getTime() - NO_SHOW_LOOKBACK_MS);
      const due = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: AppointmentStatus.NO_SHOW,
          noShowFollowUpSentAt: null,
          startsAt: { lte: cutoff, gte: oldest },
          patient: {
            email: { not: null },
            consents: { some: { type: "MARKETING", granted: true } },
          },
        },
        include: aptInclude,
        take: BATCH,
        orderBy: { startsAt: "asc" },
      });
      for (const apt of due) {
        if (!apt.patient.email) continue;
        if (apt.patient.consents.length === 0) continue;
        const claimed = await claimMarker(
          clinic.id,
          apt.id,
          "noShowFollowUpSentAt",
        );
        if (!claimed) continue;
        try {
          const content = buildNoShowFollowUpEmail({
            clinicName: clinic.name,
            clinicPhone: clinic.phone,
            patientFirstName: apt.patient.firstName,
            whenLabel: formatWhen(apt.startsAt, clinic.timezone),
            practitionerName: apt.practitioner.displayName,
            bookAgainUrl: bookUrl(clinic.slug),
          });
          const send = await sendEmail({
            to: apt.patient.email,
            subject: content.subject,
            text: content.text,
            html: content.html,
            replyTo: clinic.email,
          });
          if (send.delivered) {
            result.noShowFollowUp += 1;
          } else {
            await unclaimMarker(clinic.id, apt.id, "noShowFollowUpSentAt");
          }
        } catch (err) {
          result.errors += 1;
          console.error("No-show follow-up email failed", apt.id, err);
          await unclaimMarker(clinic.id, apt.id, "noShowFollowUpSentAt");
        }
      }
    }

    if (clinic.sameDayReminderEnabled) {
      const until = new Date(
        now.getTime() + clinic.sameDayReminderHours * 60 * 60_000,
      );
      const cooldownSince = new Date(
        now.getTime() - SAME_DAY_REMINDER_COOLDOWN_MS,
      );
      const todayKey = clinicDateKey(now, clinic.timezone);
      const due = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          sameDayReminderSentAt: null,
          startsAt: { gte: now, lte: until },
          status: {
            in: [
              AppointmentStatus.BOOKED,
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.CHECKED_IN,
            ],
          },
          OR: [
            { reminderSentAt: null },
            { reminderSentAt: { lte: cooldownSince } },
          ],
          patient: {
            OR: [{ email: { not: null } }, { phone: { not: null } }],
          },
        },
        include: aptInclude,
        take: BATCH,
        orderBy: { startsAt: "asc" },
      });
      for (const apt of due) {
        const aptDay = clinicDateKey(apt.startsAt, clinic.timezone);
        const hasContact = Boolean(apt.patient.email || apt.patient.phone);
        if (
          !shouldSendSameDayReminder({
            now,
            startsAt: apt.startsAt,
            sameDayHours: clinic.sameDayReminderHours,
            clinicDateKeyToday: todayKey,
            appointmentDateKey: aptDay,
            reminderSentAt: apt.reminderSentAt,
            hasContact,
          })
        ) {
          continue;
        }
        const claimed = await claimMarker(
          clinic.id,
          apt.id,
          "sameDayReminderSentAt",
        );
        if (!claimed) continue;
        try {
          const when = formatWhen(apt.startsAt, clinic.timezone);
          const { manageUrl } = await import("@/modules/scheduling/manage");
          const manageLink = await manageUrl(apt.id);
          let delivered = false;
          if (apt.patient.email) {
            const send = await sendEmail({
              to: apt.patient.email,
              subject: `Today — ${clinic.name}`,
              text: [
                `Hi ${apt.patient.firstName},`,
                "",
                `Friendly reminder: your appointment is today.`,
                `When: ${when}`,
                `With: ${apt.practitioner.displayName}`,
                `Service: ${apt.appointmentType.name}`,
                "",
                "Need to change it?",
                manageLink,
                "",
                `— ${clinic.name}`,
              ].join("\n"),
              replyTo: clinic.email,
            });
            delivered = send.delivered;
          }
          if (apt.patient.phone) {
            const sms = await sendSms({
              to: apt.patient.phone,
              body: `${clinic.name}: reminder today ${when} with ${apt.practitioner.displayName}. Manage: ${manageLink}`,
            });
            delivered = delivered || sms.delivered;
          }
          if (delivered) {
            result.sameDayReminder += 1;
          } else {
            await unclaimMarker(clinic.id, apt.id, "sameDayReminderSentAt");
          }
        } catch (err) {
          result.errors += 1;
          console.error("Same-day reminder failed", apt.id, err);
          await unclaimMarker(clinic.id, apt.id, "sameDayReminderSentAt");
        }
      }
    }
}
