/**
 * Email notifications — EMAIL_PROVIDER=console|resend
 * Config from env and/or DB (admin runtime settings).
 */

import {
  getEffectiveEmailProvider,
  loadEmailRuntimeConfig,
} from "./email-config";

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file bytes */
  content: string;
  contentType?: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional Reply-To (e.g. clinic inbox) */
  replyTo?: string | null;
  attachments?: EmailAttachment[];
};

export type EmailSendResult = {
  provider: "resend" | "console";
  /** True only when handed to a real delivery provider successfully */
  delivered: boolean;
};

/** Sync helper for health/tests — prefer async getEffectiveEmailProvider in request paths. */
export function getEmailProvider(): "resend" | "console" {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "console";
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase();
  if (provider === "console") return "console";
  return "resend";
}

export function isEmailDeliveryConfigured() {
  return getEmailProvider() === "resend";
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const cfg = await loadEmailRuntimeConfig();
  const provider = cfg.provider;

  if (provider === "resend" && cfg.apiKey) {
    const from =
      cfg.from?.trim() ||
      process.env.EMAIL_FROM?.trim() ||
      "Nguyen's Osteopathic Clinic <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html ?? `<pre>${escapeHtml(message.text)}</pre>`,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                ...(a.contentType
                  ? { content_type: a.contentType }
                  : {}),
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend failed: ${res.status} ${body}`);
    }
    return { provider: "resend", delivered: true };
  }

  const attachNote = message.attachments?.length
    ? ` attachments=${message.attachments.map((a) => a.filename).join(",")}`
    : "";
  if (process.env.NODE_ENV === "production") {
    console.log(
      `[email:console] to=${message.to} subject=${JSON.stringify(message.subject)}${attachNote} (body redacted)`,
    );
  } else {
    console.log(
      `[email:console] to=${message.to} subject=${JSON.stringify(message.subject)}${attachNote}\n${message.text}\n`,
    );
  }
  return { provider: "console", delivered: false };
}

export { getEffectiveEmailProvider };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
