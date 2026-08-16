import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/server/db";
import { sendEmail } from "./email";
import { AppointmentStatus } from "@/generated/prisma/client";

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
      clinic: true,
    },
  });
  if (!apt?.patient.email) return null;

  const when = formatWhen(apt.startsAt, apt.clinic.timezone);
  const subject = `Booking confirmed — ${apt.clinic.name}`;
  const text = [
    `Hi ${apt.patient.firstName},`,
    "",
    `Your appointment is confirmed at ${apt.clinic.name}.`,
    "",
    `When: ${when} (${apt.clinic.timezone})`,
    `With: ${apt.practitioner.displayName}`,
    `Service: ${apt.appointmentType.name}`,
    "",
    "If you need to change this booking, please contact the clinic.",
    "",
    "— Treow Clinic",
  ].join("\n");

  await sendEmail({ to: apt.patient.email, subject, text });
  await prisma.appointment.update({
    where: { id: apt.id },
    data: { confirmationSentAt: new Date() },
  });
  return { sent: true };
}

export async function sendUpcomingReminders(withinHours = 24) {
  const now = new Date();
  const until = new Date(now.getTime() + withinHours * 60 * 60_000);

  const due = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: now, lte: until },
      reminderSentAt: null,
      status: {
        in: [
          AppointmentStatus.BOOKED,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.CHECKED_IN,
        ],
      },
      patient: { email: { not: null } },
    },
    include: {
      patient: true,
      practitioner: true,
      appointmentType: true,
      clinic: true,
    },
    take: 100,
  });

  const results = [];
  for (const apt of due) {
    if (!apt.patient.email) continue;
    const when = formatWhen(apt.startsAt, apt.clinic.timezone);
    await sendEmail({
      to: apt.patient.email,
      subject: `Reminder — ${apt.clinic.name} tomorrow/soon`,
      text: [
        `Hi ${apt.patient.firstName},`,
        "",
        `This is a reminder for your upcoming appointment.`,
        `When: ${when}`,
        `With: ${apt.practitioner.displayName}`,
        `Service: ${apt.appointmentType.name}`,
        "",
        "— Treow Clinic",
      ].join("\n"),
    });
    await prisma.appointment.update({
      where: { id: apt.id },
      data: { reminderSentAt: new Date() },
    });
    results.push(apt.id);
  }

  return { sent: results.length, appointmentIds: results };
}

export async function sendWaitlistOfferEmail(opts: {
  entryId: string;
  clinicName: string;
  timezone: string;
  patientEmail: string | null | undefined;
  patientFirstName: string;
  serviceName: string;
  startsAt: Date;
  expiresAt: Date;
}) {
  if (!opts.patientEmail) return { sent: false };

  const when = formatWhen(opts.startsAt, opts.timezone);
  const expires = formatWhen(opts.expiresAt, opts.timezone);
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
  return { sent: true };
}

