import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBookingConfirmationEmail } from "../../src/modules/notifications/booking-confirmation-email";

describe("buildBookingConfirmationEmail", () => {
  it("builds subject, text, and html with clinic details and manage link", () => {
    const msg = buildBookingConfirmationEmail({
      clinicName: "Nguyen's Osteopathic Clinic",
      clinicPhone: "+447882843513",
      clinicAddress: "52 Powis Street, Woolwich",
      patientFirstName: "Sam",
      whenLabel: "Monday 9 November 2026 at 09:00",
      timezone: "Europe/London",
      practitionerName: "Austin Nguyen",
      serviceName: "Follow-up Osteopathic Treatment",
      roomName: "Couch 1",
      manageLink: "https://treow-clinic.vercel.app/book/manage/token",
      cancelNoticeHours: 24,
    });

    assert.match(msg.subject, /Nguyen's Osteopathic Clinic/);
    assert.match(msg.text, /Hi Sam/);
    assert.match(msg.text, /Follow-up Osteopathic Treatment/);
    assert.match(msg.text, /https:\/\/treow-clinic\.vercel\.app\/book\/manage\/token/);
    assert.match(msg.text, /at least 24 hours/);
    assert.match(msg.html, /You're booked/);
    assert.match(msg.html, /Manage this booking/);
    assert.match(msg.html, /Austin Nguyen/);
    assert.match(msg.html, /at least 24 hours/);
    assert.doesNotMatch(msg.html, /<script/i);
  });

  it("escapes HTML in clinic and patient fields", () => {
    const msg = buildBookingConfirmationEmail({
      clinicName: `Test <script>alert(1)</script>`,
      patientFirstName: `Sam & Co`,
      whenLabel: "Tuesday",
      timezone: "Europe/London",
      practitionerName: "Dr > Name",
      serviceName: "Initial",
      manageLink: "https://example.com/manage",
    });
    assert.doesNotMatch(msg.html, /<script>alert/);
    assert.match(msg.html, /Sam &amp; Co/);
    assert.match(msg.html, /Dr &gt; Name/);
  });
});
