/**
 * Email notifications — EMAIL_PROVIDER=console|resend
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional Reply-To (e.g. clinic inbox) */
  replyTo?: string | null;
};

export type EmailSendResult = {
  provider: "resend" | "console";
  /** True only when handed to a real delivery provider successfully */
  delivered: boolean;
};

export function getEmailProvider(): "resend" | "console" {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "console";
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase();
  // Prefer Resend whenever a key is present (unless explicitly forced to console).
  if (provider === "console") return "console";
  return "resend";
}

export function isEmailDeliveryConfigured() {
  return getEmailProvider() === "resend";
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const provider = getEmailProvider();

  if (provider === "resend") {
    const from =
      process.env.EMAIL_FROM?.trim() ||
      "Treow Clinic <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html ?? `<pre>${escapeHtml(message.text)}</pre>`,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend failed: ${res.status} ${body}`);
    }
    return { provider: "resend", delivered: true };
  }

  console.log(
    `[email:console] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}\n`,
  );
  return { provider: "console", delivered: false };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
