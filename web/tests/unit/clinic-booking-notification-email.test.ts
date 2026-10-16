import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClinicBookingNotificationEmail } from "../../src/modules/notifications/clinic-booking-notification-email";

describe("buildClinicBookingNotificationEmail", () => {
  it("builds clinic alert with patient details and calendar link", () => {
    const msg = buildClinicBookingNotificationEmail({
      clinicName: "Nguyen's Osteopathic Clinic",
      whenLabel: "Monday 10 November 2026 at 09:00",
      timezone: "Europe/London",
      practitionerName: "Austin Nguyen",
      serviceName: "Follow-up Osteopathic Treatment",
      roomName: "Couch 1",
      patientName: "Sam Patient",
      patientEmail: "sam@example.com",
      patientPhone: "+447700900123",
      reasonForVisit: "Lower back pain",
      source: "online",
      calendarPath: "https://treow-clinic.vercel.app/app/calendar",
    });

    assert.match(msg.subject, /New online booking — Sam Patient/);
    assert.match(msg.text, /sam@example.com/);
    assert.match(msg.text, /Lower back pain/);
    assert.match(msg.text, /https:\/\/treow-clinic\.vercel\.app\/app\/calendar/);
    assert.match(msg.html, /New online booking/);
    assert.match(msg.html, /Open calendar/);
    assert.match(msg.html, /Austin Nguyen/);
    assert.doesNotMatch(msg.html, /<script/i);
  });

  it("escapes HTML in patient and clinic fields", () => {
    const msg = buildClinicBookingNotificationEmail({
      clinicName: `Clinic <script>alert(1)</script>`,
      whenLabel: "Tuesday",
      timezone: "Europe/London",
      practitionerName: "Dr > Name",
      serviceName: "Initial",
      patientName: `Sam & Co`,
      patientEmail: "a@b.com",
      source: "staff",
    });
    assert.match(msg.subject, /staff booking/);
    assert.doesNotMatch(msg.html, /<script>alert/);
    assert.match(msg.html, /Sam &amp; Co/);
    assert.match(msg.html, /Dr &gt; Name/);
  });
});
