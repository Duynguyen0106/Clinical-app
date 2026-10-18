import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNoShowFollowUpEmail,
  buildReviewRequestEmail,
  buildThankYouEmail,
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
    });
    assert.match(mail.subject, /Thank you/);
    assert.match(mail.text, /Sam/);
    assert.match(mail.text, /Book online/);
    assert.match(mail.html, /Book again/);
    assert.match(mail.html, /https:\/\/app\.example\/book\/nguyen/);
  });

  it("builds review request with review URL", () => {
    const mail = buildReviewRequestEmail({
      clinicName: "Nguyen's Osteopathy",
      patientFirstName: "Sam",
      practitionerName: "Alex",
      reviewUrl: "https://g.page/r/example",
    });
    assert.match(mail.subject, /How was your visit/);
    assert.match(mail.text, /https:\/\/g\.page\/r\/example/);
    assert.match(mail.html, /Leave a review/);
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
});
