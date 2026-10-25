/**
 * Production boot guards — call once from instrumentation or a server entry.
 */

const DEMO_SECRETS = new Set([
  "treow-dev-secret-change-me",
  "change-me",
  "secret",
]);

export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== "production") return;

  const auth = process.env.AUTH_SECRET?.trim();
  if (!auth || auth.length < 32 || DEMO_SECRETS.has(auth)) {
    throw new Error(
      "Production requires AUTH_SECRET (≥32 chars, not the demo value).",
    );
  }

  const audio = process.env.AUDIO_ENCRYPTION_KEY?.trim();
  if (!audio || audio.length < 32 || DEMO_SECRETS.has(audio)) {
    throw new Error(
      "Production requires dedicated AUDIO_ENCRYPTION_KEY (≥32 chars, not the demo value or AUTH_SECRET fallback).",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Production requires DATABASE_URL.");
  }

  const cron = process.env.CRON_SECRET?.trim();
  if (!cron || cron.length < 24 || DEMO_SECRETS.has(cron)) {
    throw new Error(
      "Production requires CRON_SECRET (≥24 chars, not a demo value) for reminder/retention jobs.",
    );
  }

  if (!process.env.APP_BASE_URL?.startsWith("https://")) {
    console.warn(
      "[treow] APP_BASE_URL should be an https:// URL in production.",
    );
  }

  const ai = (process.env.AI_PROVIDER ?? "mock").toLowerCase();
  if (ai !== "mock" && !process.env.OPENAI_API_KEY) {
    console.warn(
      "[treow] AI_PROVIDER is not mock but OPENAI_API_KEY is missing.",
    );
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const turnstileSite = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const requireCaptcha =
    process.env.REQUIRE_PUBLIC_BOOK_CAPTCHA?.trim() === "1";
  const allowNoCaptcha =
    process.env.ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA?.trim() === "1";
  if (!turnstileSecret || !turnstileSite) {
    const msg =
      "[treow] TURNSTILE_SECRET_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY unset — public booking captcha is skipped.";
    if (requireCaptcha && !allowNoCaptcha) {
      throw new Error(
        `${msg} Set the Turnstile keys, or ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA=1.`,
      );
    }
    console.warn(msg);
  }
}

export function getSupportEmail() {
  return process.env.SUPPORT_EMAIL ?? "support@treow.example";
}

export function getAppBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
