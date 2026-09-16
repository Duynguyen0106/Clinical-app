/**
 * Email notifications — EMAIL_PROVIDER=console|resend
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(message: EmailMessage) {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();

  if (provider === "resend" && process.env.RESEND_API_KEY) {
    const from =
      process.env.EMAIL_FROM ?? "Treow Clinic <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html ?? `<pre>${message.text}</pre>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend failed: ${res.status} ${body}`);
    }
    return { provider: "resend" as const };
  }

  console.log(
    `[email:console] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}\n`,
  );
  return { provider: "console" as const };
}
