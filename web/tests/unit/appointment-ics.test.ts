import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appointmentIcsUid,
  buildAppointmentIcs,
} from "../../src/modules/notifications/appointment-ics";

describe("buildAppointmentIcs", () => {
  const startsAt = new Date("2026-11-09T09:00:00.000Z");
  const endsAt = new Date("2026-11-09T09:30:00.000Z");

  it("builds a REQUEST invite with stable UID and clinic details", () => {
    const ics = buildAppointmentIcs({
      appointmentId: "apt_123",
      clinicSlug: "nguyens-osteopathy",
      clinicName: "Nguyen's Osteopathic Clinic",
      clinicEmail: "hello@nguyensosteopathy.com",
      clinicAddress: "52 Powis Street, Woolwich",
      patientFirstName: "Sam",
      patientEmail: "sam@example.com",
      practitionerName: "Austin Nguyen",
      serviceName: "Follow-up Osteopathic Treatment",
      roomName: "Couch 1",
      startsAt,
      endsAt,
      manageLink: "https://treow-clinic.vercel.app/book/manage/token",
      method: "REQUEST",
      sequence: 0,
    });

    assert.equal(ics.filename, "appointment.ics");
    assert.match(ics.contentType, /text\/calendar/);
    assert.equal(
      appointmentIcsUid("apt_123", "nguyens-osteopathy"),
      "treow-apt_123@nguyens-osteopathy",
    );
    assert.match(ics.body, /BEGIN:VCALENDAR/);
    assert.match(ics.body, /METHOD:REQUEST/);
    assert.match(ics.body, /UID:treow-apt_123@nguyens-osteopathy/);
    assert.match(ics.body, /SEQUENCE:0/);
    assert.match(ics.body, /STATUS:CONFIRMED/);
    assert.match(ics.body, /Follow-up Osteopathic Treatment/);
    assert.match(ics.body, /52 Powis Street/);
    assert.match(ics.body, /ORGANIZER/);
    assert.match(ics.body, /ATTENDEE/);
    assert.match(ics.body, /DTSTART:20261109T090000Z/);
    assert.match(ics.body, /DTEND:20261109T093000Z/);
    // Base64 round-trip
    assert.equal(Buffer.from(ics.content, "base64").toString("utf8"), ics.body);
  });

  it("builds CANCEL with STATUS:CANCELLED and same UID", () => {
    const ics = buildAppointmentIcs({
      appointmentId: "apt_123",
      clinicSlug: "nguyens-osteopathy",
      clinicName: "Nguyen's Osteopathic Clinic",
      patientFirstName: "Sam",
      practitionerName: "Austin Nguyen",
      serviceName: "Follow-up",
      startsAt,
      endsAt,
      method: "CANCEL",
      sequence: 2,
    });
    assert.match(ics.body, /METHOD:CANCEL/);
    assert.match(ics.body, /STATUS:CANCELLED/);
    assert.match(ics.body, /UID:treow-apt_123@nguyens-osteopathy/);
    assert.match(ics.body, /SEQUENCE:2/);
  });

  it("escapes commas and newlines in ICS text fields", () => {
    const ics = buildAppointmentIcs({
      appointmentId: "apt_1",
      clinicSlug: "clinic",
      clinicName: "Clinic, Main",
      clinicAddress: "1 High St,\nLondon",
      patientFirstName: "Sam",
      practitionerName: "Dr Lee",
      serviceName: "Initial, long",
      startsAt,
      endsAt,
      sequence: 0,
    });
    assert.match(ics.body, /Clinic\\, Main/);
    assert.match(ics.body, /Initial\\, long/);
    assert.match(ics.body, /1 High St\\,\\nLondon/);
  });
});
