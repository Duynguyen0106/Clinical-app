import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/server/db";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { AppointmentStatus } from "@/generated/prisma/client";
import { manageUrl } from "@/modules/scheduling/manage";

function formatWhen(date: Date, timezone: string) {
  try {
    return formatInTimeZone(date, timezone, "EEEE d MMMM yyyy 'at' HH:mm");
  } catch {
    return date.toISOString();
  }
}

export async function sendBookingConfirmation(appointmentId: string) {
  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      room: true,
      clinic: true,
    },
  });
  if (!apt) return null;

  const when = formatWhen(apt.startsAt, apt.clinic.timezone);
  const roomLine = apt.room ? `Room: ${apt.room.name}` : null;
  const manageLink = manageUrl(apt.id);
  let emailSent = false;
  let smsSent = false;

  if (apt.patient.email) {
    const subject = `Booking confirmed — ${apt.clinic.name}`;
    const text = [
      `Hi ${apt.patient.firstName},`,
      "",
      `Your appointment is confirmed at ${apt.clinic.name}.`,
      "",
      `When: ${when} (${apt.clinic.timezone})`,
      `With: ${apt.practitioner.displayName}`,
      `Service: ${apt.appointmentType.name}`,
      roomLine,
      "",
      "Manage your booking (cancel or reschedule):",
      manageLink,
      "",
      "Online changes close within 2 hours of the appointment.",
      "",
      "— Treow Clinic",
    ]
      .filter((line) => line !== null)
      .join("\n");

    await sendEmail({ to: apt.patient.email, subject, text });
    emailSent = true;
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
    await sendSms({ to: apt.patient.phone, body: smsBody });
    smsSent = true;
  }

  if (emailSent || smsSent) {
    await prisma.appointment.update({
      where: { id: apt.id },
      data: { confirmationSentAt: new Date() },
    });
  }

  return { emailSent, smsSent, manageLink };
}

export async function sendUpcomingReminders(withinHours = 24) {
  const now = new Date();
  const until = new Date(now.getTime() + withinHours * 60 * 60_000);

  const due = await prisma.appointment.findMany({
    where: {
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

  const emailIds: string[] = [];
  const smsIds: string[] = [];

  for (const apt of due) {
    const when = formatWhen(apt.startsAt, apt.clinic.timezone);
    const roomBit = apt.room ? ` Room ${apt.room.name}.` : "";

    const manageLink = manageUrl(apt.id);

    if (!apt.reminderSentAt && apt.patient.email) {
      await sendEmail({
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
          "— Treow Clinic",
        ]
          .filter((line) => line !== null)
          .join("\n"),
      });
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { reminderSentAt: new Date() },
      });
      emailIds.push(apt.id);
    }

    if (!apt.smsReminderSentAt && apt.patient.phone) {
      await sendSms({
        to: apt.patient.phone,
        body: `${apt.clinic.name} reminder: ${when} with ${apt.practitioner.displayName}.${roomBit} Manage: ${manageLink}`.trim(),
      });
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { smsReminderSentAt: new Date() },
      });
      smsIds.push(apt.id);
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
        `Please reply to the clinic soon — this offer expires around ${expires}.`,
        "",
        `(Waitlist ref: ${opts.entryId})`,
        "",
        "— Treow Clinic",
      ].join("\n"),
    });
    emailSent = true;
  }

  if (opts.patientPhone) {
    await sendSms({
      to: opts.patientPhone,
      body: `${opts.clinicName}: ${opts.serviceName} slot free ${when}. Reply to clinic soon (offer ends ~${expires}).`,
    });
    smsSent = true;
  }

  return { emailSent, smsSent, sent: emailSent || smsSent };
}
