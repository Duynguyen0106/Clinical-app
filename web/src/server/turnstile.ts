import { badRequest } from "@/server/errors";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileSecretConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

export function turnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

/**
 * When TURNSTILE_SECRET_KEY is set, captchaToken is required and verified.
 * When unset (local/demo), captcha is skipped so smoke and pilots keep working.
 */
export async function assertTurnstileToken(
  captchaToken: string | undefined | null,
  opts: { ip?: string } = {},
) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return;

  const token = captchaToken?.trim();
  if (!token) {
    throw badRequest("Captcha verification required");
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (opts.ip && opts.ip !== "unknown") body.set("remoteip", opts.ip);

  let data: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    data = (await res.json()) as typeof data;
  } catch {
    throw badRequest("Captcha verification failed");
  }

  if (!data.success) {
    throw badRequest("Captcha verification failed");
  }
}
