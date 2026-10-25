import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/server/db";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { buildBookingConfirmationEmail } from "./booking-confirmation-email";
import { buildClinicBookingNotificationEmail } from "./clinic-booking-notification-email";
import { buildIntakeConsentEmail } from "./intake-consent-email";
import { buildAppointmentIcs } from "./appointment-ics";
import { AppointmentStatus } from "@/generated/prisma/client";
import { manageUrl } from "@/modules/scheduling/manage";
import { getAppBaseUrl } from "@/server/env";
import {
  ensureIntakeForAppointment,
  patientHasCompletedIntake,
} from "@/modules/intake/service";

function formatWhen(date: Date, timezone: string) {
  try {
    return formatInTimeZone(date, timezone, "EEEE d MMMM yyyy 'at' HH:mm");
  } catch {
    return date.toISOString();
  }
}

const appointmentNotifyInclude = {
  patient: true,
  appointmentType: true,
  room: true,
  clinic: true,
  practitioner: {
    include: {
      membership: {
        include: {
          user: { select: { email: true, name: true } },
        },
      },
    },
  },
} as const;

async function loadNotifyAppointment(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentNotifyInclude,
  });
}

type NotifyAppointment = NonNullable<
  Awaited<ReturnType<typeof loadNotifyAppointment>>
>;

function practitionerEmail(apt: NotifyAppointment) {
  return apt.practitioner.membership.user.email || null;
}

function patientCalendarInvite(
  apt: NotifyAppointment,
  opts: {
    manageLink?: string | null;
    method?: "REQUEST" | "CANCEL";
    sequence?: number;
  } = {},
) {
  return buildAppointmentIcs({
    appointmentId: apt.id,
    clinicSlug: apt.clinic.slug,
    clinicName: apt.clinic.name,
    clinicEmail: apt.clinic.email,
    clinicPhone: apt.clinic.phone,
    clinicAddress: apt.clinic.address,
    patientFirstName: apt.patient.firstName,
    patientEmail: apt.patient.email,
    practitionerName: apt.practitioner.displayName,
    serviceName: apt.appointmentType.name,
    roomName: apt.room?.name ?? null,
    startsAt: apt.startsAt,
    endsAt: apt.endsAt,
    manageLink: opts.manageLink,
    method: opts.method,
    sequence: opts.sequence,
  });
}

function practitionerName(apt: NotifyAppointment) {
  return (
    apt.practitioner.displayName ||
    apt.practitioner.membership.user.name ||
    "Practitioner"
  );
}

async function notifyPractitioner(
  apt: NotifyAppointment,
  subject: string,
  text: string,
) {
  const to = practitionerEmail(apt);
  if (!to) return false;
  await sendEmail({ to, subject, text });
  return true;
}

function clinicNotifyEmail(apt: NotifyAppointment) {
  return apt.clinic.email?.trim() || null;
}

async function notifyClinicOfBooking(
  apt: NotifyAppointment,
  source: "online" | "staff" = "online",
) {
  const to = clinicNotifyEmail(apt);
  if (!to) return false;

  const when = formatWhen(apt.startsAt, apt.clinic.timezone);
  const content = buildClinicBookingNotificationEmail({
    clinicName: apt.clinic.name,
    whenLabel: when,
    timezone: apt.clinic.timezone,
    practitionerName: apt.practitioner.displayName,
    serviceName: apt.appointmentType.name,
    roomName: apt.room?.name ?? null,
    patientName: `${apt.patient.firstName} ${apt.patient.lastName}`.trim(),
    patientEmail: apt.patient.email,
    patientPhone: apt.patient.phone,
    reasonForVisit: apt.notes,
    source,
    calendarPath: `${getAppBaseUrl()}/app/calendar`,
  });

  await sendEmail({
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: apt.patient.email,
  });
  return true;
}

export async function sendBookingConfirmation(
  appointmentId: string,
  opts: { source?: "online" | "staff" } = {},
) {
  const apt = await loadNotifyAppointment(appointmentId);
  if (!apt) return null;
  const source = opts.source ?? "online";

  const when = formatWhen(apt.startsAt, apt.clinic.timezone);
  const roomLine = apt.room ? `Room: ${apt.room.name}` : null;
  const manageLink = await manageUrl(apt.id);
  let emailSent = false;
  let emailDelivered = false;
  let emailProvider: "resend" | "console" | null = null;
  let smsSent = false;
  let clinicEmailSent = false;
  let practitionerEmailSent = false;

  // Prepare consent link up front so confirmation can include a single CTA
  // (avoids a second back-to-back consent email).
  let intakeLink: string | null = null;
  let intakeEmailSent = false;
  try {
    const done = await patientHasCompletedIntake(apt.clinicId, apt.patientId);
    if (!done && apt.patient.email?.trim()) {
      const ensured = await ensureIntakeForAppointment({
        clinicId: apt.clinicId,
        patientId: apt.patientId,
        appointmentId: apt.id,
      });
      if (ensured.url && !ensured.alreadyComplete) {
        intakeLink = ensured.url;
      }
    }
  } catch (err) {
    console.error("Intake prepare for confirmation failed", err);
  }

  if (apt.patient.email) {
    const content = buildBookingConfirmationEmail({
      clinicName: apt.clinic.name,
      clinicPhone: apt.clinic.phone,
      clinicAddress: apt.clinic.address,
      patientFirstName: apt.patient.firstName,
      whenLabel: when,
      timezone: apt.clinic.timezone,
      practitionerName: apt.practitioner.displayName,
      serviceName: apt.appointmentType.name,
      roomName: apt.room?.name ?? null,
      manageLink,
      cancelNoticeHours: apt.clinic.cancelMinNoticeHours ?? 24,
      intakeLink,
    });

    const ics = patientCalendarInvite(apt, {
      manageLink,
      method: "REQUEST",
      sequence: 0,
    });
    const result = await sendEmail({
      to: apt.patient.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      replyTo: apt.clinic.email,
      attachments: [
        {
          filename: ics.filename,
          content: ics.content,
          contentType: ics.contentType,
        },
      ],
    });
    emailSent = true;
    emailDelivered = result.delivered;
    emailProvider = result.provider;
    if (intakeLink && (result.delivered || result.provider === "console")) {
      intakeEmailSent = true;
    }
  }

  if (apt.patient.phone) {
    const smsBody = [
      `${apt.clinic.name}: booking confirmed`,
      when,
      `with ${apt.practitioner.displayName}`,
      apt.room ? `Room ${apt.room.name}` : null,
      `Manage: ${manageLink}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const smsResult = await sendSms({ to: apt.patient.phone, body: smsBody });
    smsSent = smsResult.delivered;
  }

  try {
    clinicEmailSent = await notifyClinicOfBooking(apt, source);
  } catch (err) {
    // Don't fail patient confirmation if clinic notify fails.
    console.error("Clinic booking notify failed", err);
    clinicEmailSent = false;
  }

  const clinicTo = clinicNotifyEmail(apt)?.toLowerCase() ?? null;
  const practitionerTo = practitionerEmail(apt)?.toLowerCase() ?? null;
  // Avoid duplicate inbox mail when the practitioner login is the clinic inbox.
  if (practitionerTo && practitionerTo !== clinicTo) {
    try {
      practitionerEmailSent = await notifyPractitioner(
        apt,
        `New booking — ${apt.patient.firstName} ${apt.patient.lastName}`,
        [
          `Hi ${practitionerName(apt)},`,
          "",
          `A new appointment was booked at ${apt.clinic.name}.`,
          "",
          `When: ${when} (${apt.clinic.timezone})`,
          `Patient: ${apt.patient.firstName} ${apt.patient.lastName}`,
          apt.patient.phone ? `Phone: ${apt.patient.phone}` : null,
          `Service: ${apt.appointmentType.name}`,
          roomLine,
          "",
          `— ${apt.clinic.name}`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      );
    } catch (err) {
      console.error("Practitioner booking notify failed", err);
      practitionerEmailSent = false;
    }
  }

  if (emailDelivered || smsSent) {
    await prisma.appointment.update({
      where: { id: apt.id },
      data: { confirmationSentAt: new Date() },
    });
  }

  // Fallback: if confirmation had no email / no intake CTA, try standalone consent mail.
  if (!intakeEmailSent) {
    try {
      intakeEmailSent = Boolean(
        await sendIntakeConsentEmail(apt.id, { force: false }),
      );
    } catch (err) {
      console.error("Intake consent email failed", err);
    }
  }

  return {
    emailSent,
    emailDelivered,
    emailProvider,
    smsSent,
    clinicEmailSent,
    practitionerEmailSent,
    manageLink,
    intakeEmailSent,
  };
}

/**
 * Email the osteopathic consent pack when the patient has not completed one.
 * Returns false when skipped (no email, already complete, etc.).
 */
export async function sendIntakeConsentEmail(
  appointmentId: string,
  /** @deprecated force no longer creates orphan drafts after COMPLETED */
  _opts: { force?: boolean } = {},
) {
  const apt = await loadNotifyAppointment(appointmentId);
  if (!apt?.patient.email?.trim()) return false;

  // Never orphan a COMPLETED pack — reuse DRAFT or skip when already signed.
  const done = await patientHasCompletedIntake(apt.clinicId, apt.patientId);
  if (done) return false;

  const ensured = await ensureIntakeForAppointment({
    clinicId: apt.clinicId,
    patientId: apt.patientId,
    appointmentId: apt.id,
  });
  if (!ensured.url || ensured.alreadyComplete) return false;

  const when = formatWhen(apt.startsAt, apt.clinic.timezone);
  const content = buildIntakeConsentEmail({
    clinicName: apt.clinic.name,
    clinicPhone: apt.clinic.phone,
    patientFirstName: apt.patient.firstName,
    intakeLink: ensured.url,
    whenLabel: when,
    practitionerName: apt.practitioner.displayName,
    serviceName: apt.appointmentType.name,
  });

  const result = await sendEmail({
    to: apt.patient.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: apt.clinic.email,
  });
  return result.delivered || result.provider === "console";
}

export async function sendAppointmentRescheduled(opts: {
  appointmentId: string;
  previousStartsAt: Date;
  /** When false, skip patient email/SMS (practitioner still notified). Default true. */
  notifyPatient?: boolean;
}) {
  const apt = await loadNotifyAppointment(opts.appointmentId);
  if (!apt) return null;

  const notifyPatient = opts.notifyPatient !== false;
  const when = formatWhen(apt.startsAt, apt.clinic.timezone);
  const previous = formatWhen(opts.previousStartsAt, apt.clinic.timezone);
  const roomLine = apt.room ? `Room: ${apt.room.name}` : null;
  const manageLink = await manageUrl(apt.id);
  let patientEmailSent = false;
  let patientSmsSent = false;
  let practitionerEmailSent = false;

  if (notifyPatient && apt.patient.email) {
    const ics = patientCalendarInvite(apt, {
      manageLink,
      method: "REQUEST",
      sequence: Math.max(
        1,
        Math.floor(apt.startsAt.getTime() / 1000) % 2_147_483_647,
      ),
    });
    await sendEmail({
      to: apt.patient.email,
      subject: `Appointment updated — ${apt.clinic.name}`,
      text: [
        `Hi ${apt.patient.firstName},`,
        "",
        `Your appointment at ${apt.clinic.name} has been rescheduled.`,
        "",
        `Was: ${previous}`,
        `Now: ${when} (${apt.clinic.timezone})`,
        `With: ${apt.practitioner.displayName}`,
        `Service: ${apt.appointmentType.name}`,
        roomLine,
        "",
        "An updated calendar invite (.ics) is attached.",
        "",
        "Manage your booking:",
        manageLink,
        "",
        "— Treow Clinic",
      ]
        .filter((line) => line !== null)
        .join("\n"),
      attachments: [
        {
          filename: ics.filename,
          content: ics.content,
          contentType: ics.contentType,
        },
      ],
    });
    patientEmailSent = true;
  }

  if (notifyPatient && apt.patient.phone) {
    const smsResult = await sendSms({
      to: apt.patient.phone,
      body: `${apt.clinic.name}: appointment moved to ${when} with ${apt.practitioner.displayName}. Manage: ${manageLink}`,
    });
    patientSmsSent = smsResult.delivered;
  }

  practitionerEmailSent = await notifyPractitioner(
    apt,
    `Rescheduled — ${apt.patient.firstName} ${apt.patient.lastName}`,
    [
      `Hi ${practitionerName(apt)},`,
      "",
      `An appointment on your diary was rescheduled.`,
      "",
      `Patient: ${apt.patient.firstName} ${apt.patient.lastName}`,
      `Was: ${previous}`,
      `Now: ${when} (${apt.clinic.timezone})`,
      `Service: ${apt.appointmentType.name}`,
      roomLine,
      notifyPatient ? null : "(Patient was not notified by the clinic.)",
      "",
      "— Treow Clinic",
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );

  return { patientEmailSent, patientSmsSent, practitionerEmailSent };
}

export async function sendAppointmentCancelled(appointmentId: string) {
  const apt = await loadNotifyAppointment(appointmentId);
  if (!apt) return null;

  const when = formatWhen(apt.startsAt, apt.clinic.timezone);
  const roomLine = apt.room ? `Room: ${apt.room.name}` : null;
  let patientEmailSent = false;
  let patientSmsSent = false;
  let practitionerEmailSent = false;

  if (apt.patient.email) {
    const ics = patientCalendarInvite(apt, {
      method: "CANCEL",
      sequence: Math.max(
        2,
        Math.floor(apt.startsAt.getTime() / 1000) % 2_147_483_647,
      ),
    });
    await sendEmail({
      to: apt.patient.email,
      subject: `Appointment cancelled — ${apt.clinic.name}`,
      text: [
        `Hi ${apt.patient.firstName},`,
        "",
        `Your appointment at ${apt.clinic.name} has been cancelled.`,
        "",
        `Was due: ${when} (${apt.clinic.timezone})`,
        `With: ${apt.practitioner.displayName}`,
        `Service: ${apt.appointmentType.name}`,
        roomLine,
        "",
        "A calendar cancellation (.ics) is attached so you can remove the event.",
        "",
        "Please contact the clinic if you need to rebook.",
        "",
        "— Treow Clinic",
      ]
        .filter((line) => line !== null)
        .join("\n"),
      attachments: [
        {
          filename: ics.filename,
          content: ics.content,
          contentType: ics.contentType,
        },
      ],
    });
    patientEmailSent = true;
  }

  if (apt.patient.phone) {
    const smsResult = await sendSms({
      to: apt.patient.phone,
      body: `${apt.clinic.name}: your appointment on ${when} with ${apt.practitioner.displayName} was cancelled. Contact the clinic to rebook.`,
    });
    patientSmsSent = smsResult.delivered;
  }

  practitionerEmailSent = await notifyPractitioner(
    apt,
    `Cancelled — ${apt.patient.firstName} ${apt.patient.lastName}`,
    [
      `Hi ${practitionerName(apt)},`,
      "",
      `An appointment on your diary was cancelled.`,
      "",
      `Patient: ${apt.patient.firstName} ${apt.patient.lastName}`,
      `Was due: ${when} (${apt.clinic.timezone})`,
      `Service: ${apt.appointmentType.name}`,
      roomLine,
      "",
      "— Treow Clinic",
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );

  return { patientEmailSent, patientSmsSent, practitionerEmailSent };
}

export async function sendUpcomingReminders(
  /** @deprecated prefer clinic.reminderHoursBefore; kept for call-site compat */
  withinHours?: number,
  opts: { clinicId?: string } = {},
) {
  const clinics = await prisma.clinic.findMany({
    where: opts.clinicId ? { id: opts.clinicId } : undefined,
    select: {
      id: true,
      appointmentRemindersEnabled: true,
      reminderHoursBefore: true,
    },
  });

  const emailIds: string[] = [];
  const smsIds: string[] = [];
  const now = new Date();

  for (const clinic of clinics) {
    if (!clinic.appointmentRemindersEnabled) continue;
    const hours = withinHours ?? clinic.reminderHoursBefore ?? 48;
    const until = new Date(now.getTime() + hours * 60 * 60_000);

    const due = await prisma.appointment.findMany({
      where: {
        clinicId: clinic.id,
        startsAt: { gte: now, lte: until },
        status: {
          in: [
            AppointmentStatus.BOOKED,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CHECKED_IN,
          ],
        },
        OR: [{ reminderSentAt: null }, { smsReminderSentAt: null }],
      },
      include: {
        patient: true,
        practitioner: true,
        appointmentType: true,
        room: true,
        clinic: true,
      },
      take: 100,
    });

    for (const apt of due) {
      const when = formatWhen(apt.startsAt, apt.clinic.timezone);
      const roomBit = apt.room ? ` Room ${apt.room.name}.` : "";

      const manageLink = await manageUrl(apt.id);

      if (!apt.reminderSentAt && apt.patient.email) {
        const emailResult = await sendEmail({
          to: apt.patient.email,
          subject: `Reminder — ${apt.clinic.name}`,
          text: [
            `Hi ${apt.patient.firstName},`,
            "",
            `Reminder for your upcoming appointment.`,
            `When: ${when}`,
            `With: ${apt.practitioner.displayName}`,
            `Service: ${apt.appointmentType.name}`,
            apt.room ? `Room: ${apt.room.name}` : null,
            "",
            "Need to change it?",
            manageLink,
            "",
            `— ${apt.clinic.name}`,
          ]
            .filter((line) => line !== null)
            .join("\n"),
          replyTo: apt.clinic.email,
        });
        if (emailResult.delivered) {
          const { withClinicTransaction } = await import("@/server/clinic-rls");
          await withClinicTransaction(apt.clinicId, async (tx) => {
            await tx.appointment.update({
              where: { id: apt.id },
              data: { reminderSentAt: new Date() },
            });
          });
          emailIds.push(apt.id);
        }
      }

      if (!apt.smsReminderSentAt && apt.patient.phone) {
        const smsResult = await sendSms({
          to: apt.patient.phone,
          body: `${apt.clinic.name} reminder: ${when} with ${apt.practitioner.displayName}.${roomBit} Manage: ${manageLink}`.trim(),
        });
        if (smsResult.delivered) {
          const { withClinicTransaction } = await import("@/server/clinic-rls");
          await withClinicTransaction(apt.clinicId, async (tx) => {
            await tx.appointment.update({
              where: { id: apt.id },
              data: { smsReminderSentAt: new Date() },
            });
          });
          smsIds.push(apt.id);
        }
      }
    }
  }

  return {
    sent: emailIds.length + smsIds.length,
    emailCount: emailIds.length,
    smsCount: smsIds.length,
    emailIds,
    smsIds,
  };
}

export async function sendWaitlistOfferEmail(opts: {
  entryId: string;
  clinicName: string;
  timezone: string;
  patientEmail: string | null | undefined;
  patientPhone?: string | null;
  patientFirstName: string;
  serviceName: string;
  startsAt: Date;
  expiresAt: Date;
  offerUrl?: string;
}) {
  const when = formatWhen(opts.startsAt, opts.timezone);
  const expires = formatWhen(opts.expiresAt, opts.timezone);
  let emailSent = false;
  let smsSent = false;

  if (opts.patientEmail) {
    await sendEmail({
      to: opts.patientEmail,
      subject: `Slot available — ${opts.clinicName}`,
      text: [
        `Hi ${opts.patientFirstName},`,
        "",
        `A ${opts.serviceName} slot has opened at ${opts.clinicName}.`,
        "",
        `Offered time: ${when}`,
        `This offer expires around ${expires}.`,
        "",
        opts.offerUrl
          ? `Accept or decline in one tap:\n${opts.offerUrl}`
          : "Please reply to the clinic soon to accept.",
        "",
        `(Waitlist ref: ${opts.entryId})`,
        "",
        "— Treow Clinic",
      ].join("\n"),
    });
    emailSent = true;
  }

  if (opts.patientPhone) {
    const smsResult = await sendSms({
      to: opts.patientPhone,
      body: opts.offerUrl
        ? `${opts.clinicName}: ${opts.serviceName} free ${when}. Accept/decline: ${opts.offerUrl}`
        : `${opts.clinicName}: ${opts.serviceName} slot free ${when}. Reply to clinic soon (offer ends ~${expires}).`,
    });
    smsSent = smsResult.delivered;
  }

  return { emailSent, smsSent, sent: emailSent || smsSent };
}
