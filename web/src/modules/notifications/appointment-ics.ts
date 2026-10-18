/**
 * Patient-facing calendar invites (.ics) for booking confirm / update / cancel.
 * Stable UID per appointment so clients replace the same event on reschedule.
 */

export type AppointmentIcsInput = {
  appointmentId: string;
  clinicSlug: string;
  clinicName: string;
  clinicEmail?: string | null;
  clinicPhone?: string | null;
  clinicAddress?: string | null;
  patientFirstName: string;
  patientEmail?: string | null;
  practitionerName: string;
  serviceName: string;
  roomName?: string | null;
  startsAt: Date;
  endsAt: Date;
  manageLink?: string | null;
  /** REQUEST (default) or CANCEL */
  method?: "REQUEST" | "CANCEL";
  /**
   * Monotonic SEQUENCE for updates. Defaults to a time-based value so each
   * outbound invite/cancel bumps clients that already stored the event.
   */
  sequence?: number;
};

export type AppointmentIcsAttachment = {
  filename: string;
  contentType: string;
  /** Base64 content for Resend */
  content: string;
  /** Raw ICS body (tests / console) */
  body: string;
};

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
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

export function appointmentIcsUid(appointmentId: string, clinicSlug: string) {
  const slug = (clinicSlug || "clinic").replace(/[^a-zA-Z0-9.-]/g, "-");
  return `treow-${appointmentId}@${slug}`;
}

export function buildAppointmentIcs(
  input: AppointmentIcsInput,
): AppointmentIcsAttachment {
  const method = input.method ?? "REQUEST";
  const sequence =
    input.sequence ?? Math.max(0, Math.floor(Date.now() / 1000) % 2_147_483_647);
  const uid = appointmentIcsUid(input.appointmentId, input.clinicSlug);
  const summary = `${input.serviceName} — ${input.clinicName}`;
  const descParts = [
    `With: ${input.practitionerName}`,
    `Service: ${input.serviceName}`,
    input.roomName ? `Room: ${input.roomName}` : null,
    input.clinicPhone ? `Phone: ${input.clinicPhone}` : null,
    input.manageLink ? `Manage: ${input.manageLink}` : null,
  ].filter((line): line is string => Boolean(line));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Treow Clinic//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDateUtc(new Date())}`,
    `DTSTART:${icsDateUtc(input.startsAt)}`,
    `DTEND:${icsDateUtc(input.endsAt)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(descParts.join("\\n"))}`,
    `SEQUENCE:${sequence}`,
  ];

  if (input.clinicAddress?.trim()) {
    lines.push(`LOCATION:${icsEscape(input.clinicAddress.trim())}`);
  }

  const organizerEmail =
    input.clinicEmail?.trim() || "noreply@treow.clinic";
  lines.push(
    `ORGANIZER;CN=${icsEscape(input.clinicName)}:mailto:${organizerEmail}`,
  );

  if (input.patientEmail?.trim()) {
    lines.push(
      `ATTENDEE;CN=${icsEscape(input.patientFirstName)};RSVP=FALSE;PARTSTAT=ACCEPTED:mailto:${input.patientEmail.trim()}`,
    );
  }

  if (method === "CANCEL") {
    lines.push("STATUS:CANCELLED");
  } else {
    lines.push("STATUS:CONFIRMED");
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  const body = `${lines.map(foldLine).join("\r\n")}\r\n`;
  return {
    filename: "appointment.ics",
    contentType: "text/calendar; charset=utf-8; method=" + method,
    content: Buffer.from(body, "utf8").toString("base64"),
    body,
  };
}
