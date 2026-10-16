/** Pure builders for patient booking confirmation email (unit-testable). */

export type BookingConfirmationContentInput = {
  clinicName: string;
  clinicPhone?: string | null;
  clinicAddress?: string | null;
  patientFirstName: string;
  whenLabel: string;
  timezone: string;
  practitionerName: string;
  serviceName: string;
  roomName?: string | null;
  manageLink: string;
  cancelNoticeHours?: number;
};

export function buildBookingConfirmationEmail(
  input: BookingConfirmationContentInput,
) {
  const notice = input.cancelNoticeHours ?? 24;
  const subject = `Booking confirmed — ${input.clinicName}`;

  const lines = [
    `Hi ${input.patientFirstName},`,
    "",
    `Your appointment is confirmed at ${input.clinicName}.`,
    "",
    `When: ${input.whenLabel} (${input.timezone})`,
    `With: ${input.practitionerName}`,
    `Service: ${input.serviceName}`,
    input.roomName ? `Room: ${input.roomName}` : null,
    input.clinicAddress ? `Where: ${input.clinicAddress}` : null,
    input.clinicPhone ? `Phone: ${input.clinicPhone}` : null,
    "",
    "Manage your booking (cancel or reschedule):",
    input.manageLink,
    "",
    `Online cancel/reschedule needs at least ${notice} hours’ notice.`,
    "",
    `— ${input.clinicName}`,
  ].filter((line): line is string => line !== null);

  const text = lines.join("\n");

  const detailRows = [
    ["When", `${input.whenLabel} (${input.timezone})`],
    ["With", input.practitionerName],
    ["Service", input.serviceName],
    input.roomName ? ["Room", input.roomName] : null,
    input.clinicAddress ? ["Where", input.clinicAddress] : null,
    input.clinicPhone ? ["Phone", input.clinicPhone] : null,
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
              You're booked
            </td>
          </tr>
          <tr>
            <td style="padding-top:14px;font-size:16px;line-height:1.5;color:#24332e;font-family:system-ui,-apple-system,sans-serif;">
              Hi ${escapeHtml(input.patientFirstName)}, your appointment is confirmed.
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:22px;" align="center">
              <a href="${escapeHtml(input.manageLink)}" style="display:inline-block;background:#1E3F37;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:999px;">
                Manage this booking
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;font-size:13px;line-height:1.45;color:#6a7a74;font-family:system-ui,-apple-system,sans-serif;">
              Online cancel/reschedule needs at least ${notice} hours’ notice.
              After that, please contact the clinic
              ${input.clinicPhone ? ` on ${escapeHtml(input.clinicPhone)}` : ""}.
            </td>
          </tr>
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
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
