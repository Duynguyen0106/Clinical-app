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
  if (audio && (audio.length < 32 || DEMO_SECRETS.has(audio))) {
    throw new Error(
      "AUDIO_ENCRYPTION_KEY must be ≥32 chars and not a demo placeholder.",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Production requires DATABASE_URL.");
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
}

export function getSupportEmail() {
  return process.env.SUPPORT_EMAIL ?? "support@treow.example";
}

export function getAppBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
