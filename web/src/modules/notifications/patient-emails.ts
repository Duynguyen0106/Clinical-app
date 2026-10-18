/**
 * Patient lifecycle emails — thank-you, review request, no-show follow-up,
 * optional same-day reminder. Driven by Clinic settings + cron.
 */
import { AppointmentStatus } from "@/generated/prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/server/db";
import { withClinicTransaction } from "@/server/clinic-rls";
import { getAppBaseUrl } from "@/server/env";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import {
  buildNoShowFollowUpEmail,
  buildReviewRequestEmail,
  buildThankYouEmail,
} from "./patient-lifecycle-email";

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

const aptInclude = {
  patient: true,
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
};

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
  };

  for (const clinic of clinics) {
    const now = new Date();

    if (clinic.thankYouEnabled) {
      const cutoff = new Date(
        now.getTime() - clinic.thankYouDelayHours * 60 * 60_000,
      );
      const due = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: AppointmentStatus.COMPLETED,
          thankYouSentAt: null,
          endsAt: { lte: cutoff },
          patient: { email: { not: null } },
        },
        include: aptInclude,
        take: 50,
        orderBy: { endsAt: "asc" },
      });
      for (const apt of due) {
        if (!apt.patient.email) continue;
        const content = buildThankYouEmail({
          clinicName: clinic.name,
          clinicPhone: clinic.phone,
          patientFirstName: apt.patient.firstName,
          practitionerName: apt.practitioner.displayName,
          serviceName: apt.appointmentType.name,
          whenLabel: formatWhen(apt.startsAt, clinic.timezone),
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
          await withClinicTransaction(clinic.id, async (tx) => {
            await tx.appointment.update({
              where: { id: apt.id },
              data: { thankYouSentAt: new Date() },
            });
          });
          result.thankYou += 1;
        }
      }
    }

    if (clinic.reviewRequestEnabled && clinic.reviewUrl?.trim()) {
      const cutoff = new Date(
        now.getTime() -
          clinic.reviewRequestDelayDays * 24 * 60 * 60_000,
      );
      const due = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: AppointmentStatus.COMPLETED,
          reviewRequestSentAt: null,
          endsAt: { lte: cutoff },
          // Prefer after thank-you when thank-you is on
          ...(clinic.thankYouEnabled
            ? { thankYouSentAt: { not: null } }
            : {}),
          patient: { email: { not: null } },
        },
        include: aptInclude,
        take: 50,
        orderBy: { endsAt: "asc" },
      });
      for (const apt of due) {
        if (!apt.patient.email) continue;
        const content = buildReviewRequestEmail({
          clinicName: clinic.name,
          patientFirstName: apt.patient.firstName,
          practitionerName: apt.practitioner.displayName,
          reviewUrl: clinic.reviewUrl.trim(),
        });
        const send = await sendEmail({
          to: apt.patient.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          replyTo: clinic.email,
        });
        if (send.delivered) {
          await withClinicTransaction(clinic.id, async (tx) => {
            await tx.appointment.update({
              where: { id: apt.id },
              data: { reviewRequestSentAt: new Date() },
            });
          });
          result.reviewRequest += 1;
        }
      }
    }

    if (clinic.noShowFollowUpEnabled) {
      const cutoff = new Date(
        now.getTime() - clinic.noShowFollowUpDelayHours * 60 * 60_000,
      );
      const due = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: AppointmentStatus.NO_SHOW,
          noShowFollowUpSentAt: null,
          startsAt: { lte: cutoff },
          patient: { email: { not: null } },
        },
        include: aptInclude,
        take: 50,
        orderBy: { startsAt: "asc" },
      });
      for (const apt of due) {
        if (!apt.patient.email) continue;
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
          await withClinicTransaction(clinic.id, async (tx) => {
            await tx.appointment.update({
              where: { id: apt.id },
              data: { noShowFollowUpSentAt: new Date() },
            });
          });
          result.noShowFollowUp += 1;
        }
      }
    }

    if (clinic.sameDayReminderEnabled) {
      const until = new Date(
        now.getTime() + clinic.sameDayReminderHours * 60 * 60_000,
      );
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
        },
        include: aptInclude,
        take: 50,
        orderBy: { startsAt: "asc" },
      });
      for (const apt of due) {
        const when = formatWhen(apt.startsAt, clinic.timezone);
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
              `— ${clinic.name}`,
            ].join("\n"),
            replyTo: clinic.email,
          });
          delivered = send.delivered;
        }
        if (apt.patient.phone) {
          const sms = await sendSms({
            to: apt.patient.phone,
            body: `${clinic.name}: reminder today ${when} with ${apt.practitioner.displayName}.`,
          });
          delivered = delivered || sms.delivered;
        }
        if (delivered) {
          await withClinicTransaction(clinic.id, async (tx) => {
            await tx.appointment.update({
              where: { id: apt.id },
              data: { sameDayReminderSentAt: new Date() },
            });
          });
          result.sameDayReminder += 1;
        }
      }
    }
  }

  result.sent =
    result.thankYou +
    result.reviewRequest +
    result.noShowFollowUp +
    result.sameDayReminder;
  return result;
}
