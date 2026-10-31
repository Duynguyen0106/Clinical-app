import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBookingConfirmationEmail,
  mapsDirectionsUrl,
} from "../../src/modules/notifications/booking-confirmation-email";

describe("buildBookingConfirmationEmail", () => {
  it("builds subject, text, and html with clinic details and manage link", () => {
    const address = "52 Powis Street, Woolwich";
    const directions = mapsDirectionsUrl(address);
    const msg = buildBookingConfirmationEmail({
      clinicName: "Nguyen's Osteopathic Clinic",
      clinicPhone: "+447882843513",
      clinicAddress: address,
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
    assert.match(msg.text, /Clinic address: 52 Powis Street, Woolwich/);
    assert.match(msg.text, new RegExp(`Get directions: ${directions.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(msg.text, /https:\/\/treow-clinic\.vercel\.app\/book\/manage\/token/);
    assert.match(msg.text, /at least 24 hours/);
    assert.match(msg.text, /calendar invite \(\.ics\)/i);
    assert.match(msg.html, /You're booked/);
    assert.match(msg.html, /Manage this booking/);
    assert.match(msg.html, /Austin Nguyen/);
    assert.match(msg.html, /Clinic address/);
    assert.match(msg.html, /52 Powis Street, Woolwich/);
    assert.match(msg.html, /Get directions/);
    assert.match(msg.html, /maps\/search\/\?api=1&amp;query=/);
    assert.match(msg.html, /at least 24 hours/);
    assert.match(msg.html, /calendar invite \(\.ics\)/i);
    assert.doesNotMatch(msg.html, /<script/i);
  });

  it("omits clinic address and directions when address is missing", () => {
    const msg = buildBookingConfirmationEmail({
      clinicName: "Northbank Manual Therapy",
      patientFirstName: "Alex",
      whenLabel: "Wednesday 4 November 2026 at 10:00",
      timezone: "Europe/London",
      practitionerName: "Alex Nguyen",
      serviceName: "Initial assessment",
      manageLink: "https://example.com/manage",
    });

    assert.doesNotMatch(msg.text, /Clinic address/);
    assert.doesNotMatch(msg.text, /Get directions/);
    assert.doesNotMatch(msg.html, /Clinic address/);
    assert.doesNotMatch(msg.html, /Get directions/);
    assert.doesNotMatch(msg.html, /maps\.google|google\.com\/maps/i);
  });

  it("escapes HTML in clinic and patient fields", () => {
    const msg = buildBookingConfirmationEmail({
      clinicName: `Test <script>alert(1)</script>`,
      clinicAddress: `12 <b>Quayside</b> & Co`,
      patientFirstName: `Sam & Co`,
      whenLabel: "Tuesday",
      timezone: "Europe/London",
      practitionerName: "Dr > Name",
      serviceName: "Initial",
      manageLink: "https://example.com/manage",
    });
    assert.doesNotMatch(msg.html, /<script>alert/);
    assert.doesNotMatch(msg.html, /<b>Quayside<\/b>/);
    assert.match(msg.html, /Sam &amp; Co/);
    assert.match(msg.html, /Dr &gt; Name/);
    assert.match(msg.html, /12 &lt;b&gt;Quayside&lt;\/b&gt; &amp; Co/);
    assert.match(msg.html, /Get directions/);
  });
});

describe("mapsDirectionsUrl", () => {
  it("builds a Google Maps search URL from the address", () => {
    assert.equal(
      mapsDirectionsUrl("52 Powis Street, Woolwich"),
      "https://www.google.com/maps/search/?api=1&query=52%20Powis%20Street%2C%20Woolwich",
    );
  });
});
