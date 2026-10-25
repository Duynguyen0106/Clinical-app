/** Pure builders for osteopathic consent-pack email (unit-testable). */

export type IntakeConsentEmailInput = {
  clinicName: string;
  clinicPhone?: string | null;
  patientFirstName: string;
  intakeLink: string;
  whenLabel?: string | null;
  practitionerName?: string | null;
  serviceName?: string | null;
};

export function buildIntakeConsentEmail(input: IntakeConsentEmailInput) {
  const subject = `Please sign your consent forms — ${input.clinicName}`;

  const appointmentBits = [
    input.whenLabel ? `When: ${input.whenLabel}` : null,
    input.practitionerName ? `With: ${input.practitionerName}` : null,
    input.serviceName ? `Service: ${input.serviceName}` : null,
  ].filter((line): line is string => Boolean(line));

  const text = [
    `Hi ${input.patientFirstName},`,
    "",
    `Before your visit at ${input.clinicName}, please review and sign a short consent pack.`,
    "It takes about 2 minutes — treatment consent, privacy acknowledgment, and your signature.",
    "",
    ...(appointmentBits.length ? [...appointmentBits, ""] : []),
    "Open your consent forms:",
    input.intakeLink,
    "",
    input.clinicPhone ? `Clinic phone: ${input.clinicPhone}` : null,
    "",
    `— ${input.clinicName}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const detailRows = [
    input.whenLabel ? ["When", input.whenLabel] : null,
    input.practitionerName ? ["With", input.practitionerName] : null,
    input.serviceName ? ["Service", input.serviceName] : null,
  ].filter((row): row is [string, string] => Boolean(row));

  const rowsHtml = detailRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5b6b66;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#14201c;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#eef3f1;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f1;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px 24px;border:1px solid #d5e0db;">
          <tr>
            <td style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#1E3F37;font-family:system-ui,-apple-system,sans-serif;font-weight:700;">
              ${escapeHtml(input.clinicName)}
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px;font-size:28px;line-height:1.2;color:#14201c;">
              Sign your consent forms
            </td>
          </tr>
          <tr>
            <td style="padding-top:12px;font-size:16px;line-height:1.5;color:#3a4a45;">
              Hi ${escapeHtml(input.patientFirstName)}, before your visit please review a short osteopathic consent pack — about 2 minutes.
            </td>
          </tr>
          ${
            rowsHtml
              ? `<tr><td style="padding-top:16px;"><table role="presentation" cellspacing="0" cellpadding="0">${rowsHtml}</table></td></tr>`
              : ""
          }
          <tr>
            <td style="padding-top:24px;">
              <a href="${escapeHtml(input.intakeLink)}" style="display:inline-block;background:#1E3F37;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-size:15px;font-weight:600;padding:12px 20px;border-radius:10px;">
                Open consent forms
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;font-size:13px;line-height:1.45;color:#5b6b66;font-family:system-ui,-apple-system,sans-serif;">
              Treatment consent, privacy acknowledgment, and your signature. You can decline any technique or stop at any time during your visit.
            </td>
          </tr>
          ${
            input.clinicPhone
              ? `<tr><td style="padding-top:12px;font-size:13px;color:#5b6b66;">Phone: ${escapeHtml(input.clinicPhone)}</td></tr>`
              : ""
          }
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
