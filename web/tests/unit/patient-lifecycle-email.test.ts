import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCheckupReminderEmail,
  buildNoShowFollowUpEmail,
  buildReviewRequestEmail,
  buildThankYouEmail,
  buildWinBackReminderEmail,
} from "@/modules/notifications/patient-lifecycle-email";

describe("patient lifecycle emails", () => {
  it("builds thank-you with book-again link", () => {
    const mail = buildThankYouEmail({
      clinicName: "Nguyen's Osteopathy",
      clinicPhone: "01234 567890",
      patientFirstName: "Sam",
      practitionerName: "Alex",
      serviceName: "Follow-up",
      whenLabel: "Monday 20 October 2026 at 10:00",
      bookAgainUrl: "https://app.example/book/nguyen",
      prefsUrl: "https://app.example/book/email-prefs/tok",
    });
    assert.match(mail.subject, /Thank you/);
    assert.match(mail.text, /Sam/);
    assert.match(mail.text, /Book online/);
    assert.match(mail.text, /Manage preferences/);
    assert.match(mail.html, /Book again/);
    assert.match(mail.html, /https:\/\/app\.example\/book\/nguyen/);
    assert.match(mail.html, /Unsubscribe or manage preferences/);
  });

  it("builds review request with review URL", () => {
    const mail = buildReviewRequestEmail({
      clinicName: "Nguyen's Osteopathy",
      patientFirstName: "Sam",
      practitionerName: "Alex",
      reviewUrl: "https://g.page/r/example",
      prefsUrl: "https://app.example/book/email-prefs/tok",
    });
    assert.match(mail.subject, /How was your visit/);
    assert.match(mail.text, /https:\/\/g\.page\/r\/example/);
    assert.match(mail.text, /Manage preferences/);
    assert.match(mail.html, /Leave a review/);
    assert.match(mail.html, /Unsubscribe or manage preferences/);
  });

  it("builds no-show follow-up", () => {
    const mail = buildNoShowFollowUpEmail({
      clinicName: "Nguyen's Osteopathy",
      patientFirstName: "Sam",
      whenLabel: "Monday 20 October 2026 at 10:00",
      practitionerName: "Alex",
      bookAgainUrl: "https://app.example/book/nguyen",
    });
    assert.match(mail.subject, /missed you/i);
    assert.match(mail.text, /rebook/i);
    assert.match(mail.html, /Rebook/);
  });

  it("builds check-up rebook reminder with book URL", () => {
    const mail = buildCheckupReminderEmail({
      clinicName: "Nguyen's Osteopathy",
      clinicPhone: "01234 567890",
      patientFirstName: "Sam",
      practitionerName: "Alex",
      whenLabel: "Monday 20 October 2026 at 10:00",
      bookAgainUrl: "https://app.example/book/nguyen?rebook=tok",
      prefsUrl: "https://app.example/book/email-prefs/tok",
    });
    assert.match(mail.subject, /check-up/i);
    assert.match(mail.text, /Sam/);
    assert.match(mail.text, /Book online/);
    assert.match(mail.text, /rebook=tok/);
    assert.match(mail.text, /Manage preferences/);
    assert.match(mail.html, /Book a check-up/);
    assert.match(mail.html, /rebook=tok/);
  });

  it("builds win-back reminder with percent off CTA", () => {
    const mail = buildWinBackReminderEmail({
      clinicName: "Nguyen's Osteopathy",
      clinicPhone: "01234 567890",
      patientFirstName: "Sam",
      practitionerName: "Alex",
      whenLabel: "Monday 20 July 2026 at 10:00",
      percentOff: 15,
      bookAgainUrl: "https://app.example/book/nguyen?rebook=wb",
      prefsUrl: "https://app.example/book/email-prefs/tok",
    });
    assert.match(mail.subject, /15% off/);
    assert.match(mail.text, /Sam/);
    assert.match(mail.text, /15% off/);
    assert.match(mail.text, /rebook=wb/);
    assert.match(mail.html, /Book with 15% off/);
    assert.match(mail.html, /rebook=wb/);
  });
});
