/** Pure builders for post-visit / lifecycle patient emails (unit-testable). */

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapHtml(clinicName: string, title: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#eef3f1;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f1;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #d5e0db;">
          <tr>
            <td style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#1E3F37;font-family:system-ui,-apple-system,sans-serif;font-weight:700;">
              ${escapeHtml(clinicName)}
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px;font-size:28px;line-height:1.2;color:#14201c;">
              ${escapeHtml(title)}
            </td>
          </tr>
          <tr>
            <td style="padding-top:14px;font-size:16px;line-height:1.5;color:#24332e;font-family:system-ui,-apple-system,sans-serif;">
              ${bodyHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export type ThankYouEmailInput = {
  clinicName: string;
  clinicPhone?: string | null;
  patientFirstName: string;
  practitionerName: string;
  serviceName: string;
  whenLabel: string;
  bookAgainUrl?: string | null;
};

export function buildThankYouEmail(input: ThankYouEmailInput) {
  const subject = `Thank you — ${input.clinicName}`;
  const lines = [
    `Hi ${input.patientFirstName},`,
    "",
    `Thank you for coming in to see ${input.practitionerName} for your ${input.serviceName}.`,
    `We hope you're feeling better after your visit on ${input.whenLabel}.`,
    "",
    input.bookAgainUrl
      ? `Need another appointment? Book online:\n${input.bookAgainUrl}`
      : null,
    input.clinicPhone ? `Or call us on ${input.clinicPhone}.` : null,
    "",
    `— ${input.clinicName}`,
  ].filter((line): line is string => line !== null);

  const bookHtml = input.bookAgainUrl
    ? `<p style="margin:18px 0 0;"><a href="${escapeHtml(input.bookAgainUrl)}" style="display:inline-block;background:#1E3F37;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;">Book again</a></p>`
    : "";

  const html = wrapHtml(
    input.clinicName,
    "Thank you",
    `<p style="margin:0;">Hi ${escapeHtml(input.patientFirstName)},</p>
     <p style="margin:12px 0 0;">Thank you for coming in to see ${escapeHtml(input.practitionerName)} for your ${escapeHtml(input.serviceName)}. We hope you're feeling better after your visit on ${escapeHtml(input.whenLabel)}.</p>
     ${bookHtml}
     <p style="margin:18px 0 0;color:#5b6b66;font-size:14px;">— ${escapeHtml(input.clinicName)}${input.clinicPhone ? ` · ${escapeHtml(input.clinicPhone)}` : ""}</p>`,
  );

  return { subject, text: lines.join("\n"), html };
}

export type ReviewRequestEmailInput = {
  clinicName: string;
  patientFirstName: string;
  practitionerName: string;
  reviewUrl: string;
};

export function buildReviewRequestEmail(input: ReviewRequestEmailInput) {
  const subject = `How was your visit? — ${input.clinicName}`;
  const lines = [
    `Hi ${input.patientFirstName},`,
    "",
    `If you have a moment, we'd love a short review of your recent visit with ${input.practitionerName}.`,
    "It helps other patients find us and means a great deal to the clinic.",
    "",
    "Leave a review:",
    input.reviewUrl,
    "",
    `Thank you — ${input.clinicName}`,
  ];

  const html = wrapHtml(
    input.clinicName,
    "How was your visit?",
    `<p style="margin:0;">Hi ${escapeHtml(input.patientFirstName)},</p>
     <p style="margin:12px 0 0;">If you have a moment, we'd love a short review of your recent visit with ${escapeHtml(input.practitionerName)}. It helps other patients find us.</p>
     <p style="margin:18px 0 0;"><a href="${escapeHtml(input.reviewUrl)}" style="display:inline-block;background:#1E3F37;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;">Leave a review</a></p>
     <p style="margin:18px 0 0;color:#5b6b66;font-size:14px;">Thank you — ${escapeHtml(input.clinicName)}</p>`,
  );

  return { subject, text: lines.join("\n"), html };
}

export type NoShowFollowUpEmailInput = {
  clinicName: string;
  clinicPhone?: string | null;
  patientFirstName: string;
  whenLabel: string;
  practitionerName: string;
  bookAgainUrl?: string | null;
};

export function buildNoShowFollowUpEmail(input: NoShowFollowUpEmailInput) {
  const subject = `We missed you — ${input.clinicName}`;
  const lines = [
    `Hi ${input.patientFirstName},`,
    "",
    `We had you down to see ${input.practitionerName} on ${input.whenLabel}, but weren't able to see you.`,
    "If you'd still like an appointment, we're happy to help you rebook.",
    "",
    input.bookAgainUrl ? `Book online:\n${input.bookAgainUrl}` : null,
    input.clinicPhone ? `Or call ${input.clinicPhone}.` : null,
    "",
    `— ${input.clinicName}`,
  ].filter((line): line is string => line !== null);

  const bookHtml = input.bookAgainUrl
    ? `<p style="margin:18px 0 0;"><a href="${escapeHtml(input.bookAgainUrl)}" style="display:inline-block;background:#1E3F37;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;">Rebook</a></p>`
    : "";

  const html = wrapHtml(
    input.clinicName,
    "We missed you",
    `<p style="margin:0;">Hi ${escapeHtml(input.patientFirstName)},</p>
     <p style="margin:12px 0 0;">We had you down to see ${escapeHtml(input.practitionerName)} on ${escapeHtml(input.whenLabel)}, but weren't able to see you. If you'd still like an appointment, we're happy to help you rebook.</p>
     ${bookHtml}
     <p style="margin:18px 0 0;color:#5b6b66;font-size:14px;">— ${escapeHtml(input.clinicName)}${input.clinicPhone ? ` · ${escapeHtml(input.clinicPhone)}` : ""}</p>`,
  );

  return { subject, text: lines.join("\n"), html };
}
