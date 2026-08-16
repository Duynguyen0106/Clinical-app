/**
 * SMS notifications — SMS_PROVIDER=console|twilio
 */

export type SmsMessage = {
  to: string;
  body: string;
};

function normaliseUkPhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  return digits;
}

export async function sendSms(message: SmsMessage) {
  const to = normaliseUkPhone(message.to);
  const provider = (process.env.SMS_PROVIDER ?? "console").toLowerCase();

  if (
    provider === "twilio" &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({ To: to, From: from, Body: message.body });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio SMS failed: ${res.status} ${text}`);
    }
    return { provider: "twilio" as const, to };
  }

  console.log(
    `[sms:console] to=${to}\n${message.body}\n`,
  );
  return { provider: "console" as const, to };
}
