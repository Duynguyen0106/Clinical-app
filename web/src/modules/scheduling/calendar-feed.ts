import { createHash, randomBytes } from "node:crypto";
import { AppointmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { AuthContext } from "@/server/auth";
import { forbidden, notFound } from "@/server/errors";

function newFeedToken() {
  return randomBytes(24).toString("hex");
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsDateUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

async function requireOwnProfile(ctx: AuthContext) {
  if (!ctx.practitionerProfileId) {
    throw forbidden("Only practitioners with a diary can subscribe a phone calendar");
  }
  const profile = await prisma.practitionerProfile.findFirst({
    where: {
      id: ctx.practitionerProfileId,
      membership: { clinicId: ctx.clinicId },
    },
    include: {
      membership: { include: { clinic: { select: { name: true, slug: true, timezone: true } } } },
    },
  });
  if (!profile) throw notFound("Practitioner profile not found");
  return profile;
}

function feedUrls(token: string, origin: string) {
  const path = `/api/v1/calendar/feed/${token}.ics`;
  const httpsUrl = `${origin.replace(/\/$/, "")}${path}`;
  const webcalUrl = httpsUrl.replace(/^https:/i, "webcal:").replace(/^http:/i, "webcal:");
  return { httpsUrl, webcalUrl, path };
}

export async function getMyCalendarFeed(
  ctx: AuthContext,
  opts: { origin: string },
) {
  const profile = await requireOwnProfile(ctx);
  let token = profile.calendarFeedToken;
  if (!token) {
    token = newFeedToken();
    await prisma.practitionerProfile.update({
      where: { id: profile.id },
      data: { calendarFeedToken: token },
    });
  }
  const urls = feedUrls(token, opts.origin);
  return {
    practitionerId: profile.id,
    displayName: profile.displayName,
    clinicName: profile.membership.clinic.name,
    timezone: profile.membership.clinic.timezone,
    ...urls,
    instructions: [
      "iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste the webcal link.",
      "Google Calendar (phone/web): Other calendars → From URL → paste the https link.",
      "Outlook: Add calendar → Subscribe from web → paste the https link.",
    ],
  };
}

export async function rotateMyCalendarFeed(
  ctx: AuthContext,
  opts: { origin: string },
) {
  const profile = await requireOwnProfile(ctx);
  const token = newFeedToken();
  await prisma.practitionerProfile.update({
    where: { id: profile.id },
    data: { calendarFeedToken: token },
  });
  return getMyCalendarFeed(ctx, opts);
}

export async function buildCalendarFeedIcs(token: string) {
  const profile = await prisma.practitionerProfile.findFirst({
    where: { calendarFeedToken: token, active: true },
    include: {
      membership: {
        include: { clinic: { select: { name: true, timezone: true, slug: true } } },
      },
    },
  });
  if (!profile) throw notFound("Calendar feed not found");

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 14);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 120);

  const appointments = await prisma.appointment.findMany({
    where: {
      practitionerId: profile.id,
      startsAt: { gte: from, lte: to },
      status: {
        notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      },
    },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      appointmentType: { select: { name: true } },
      room: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
    take: 500,
  });

  const calName = `${profile.membership.clinic.name} — ${profile.displayName}`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Treow Clinic//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calName)}`,
    `X-WR-TIMEZONE:${icsEscape(profile.membership.clinic.timezone)}`,
  ];

  const nowStamp = icsDateUtc(new Date());

  for (const apt of appointments) {
    const summary = `${apt.patient.firstName} ${apt.patient.lastName} — ${apt.appointmentType.name}`;
    const descParts = [
      `Patient: ${apt.patient.firstName} ${apt.patient.lastName}`,
      `Service: ${apt.appointmentType.name}`,
      apt.room ? `Room: ${apt.room.name}` : null,
      `Status: ${apt.status}`,
      apt.notes ? `Notes: ${apt.notes}` : null,
    ].filter(Boolean);
    const uid = `treow-${apt.id}@${profile.membership.clinic.slug || "clinic"}`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${icsDateUtc(apt.startsAt)}`);
    lines.push(`DTEND:${icsDateUtc(apt.endsAt)}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    lines.push(`DESCRIPTION:${icsEscape(descParts.join("\\n"))}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  // Soft hash so clients can detect change
  const etagSeed = createHash("sha256")
    .update(
      appointments
        .map((a) => `${a.id}:${a.startsAt.toISOString()}:${a.status}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 16);

  lines.push("END:VCALENDAR");
  const body = `${lines.map(foldLine).join("\r\n")}\r\n`;
  return {
    body,
    etag: `"${etagSeed}"`,
    filename: `treow-${profile.membership.clinic.slug || "clinic"}.ics`,
  };
}
