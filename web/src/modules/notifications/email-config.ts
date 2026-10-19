import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { prisma } from "@/server/db";

type EmailRuntimeConfig = {
  apiKey: string | null;
  from: string | null;
  provider: "resend" | "console";
};

const cache: { at: number; value: EmailRuntimeConfig } = {
  at: 0,
  value: { apiKey: null, from: null, provider: "console" },
};

const CACHE_MS = 30_000;
const ENC_PREFIX = "enc:v1:";

function settingsKey() {
  const secret =
    process.env.AUTH_SECRET?.trim() || "treow-dev-secret-change-me";
  return createHash("sha256").update(`email-settings:${secret}`).digest();
}

/** Encrypt a secret for SystemSetting storage (AES-256-GCM). */
export function sealSettingSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", settingsKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    ENC_PREFIX +
    Buffer.concat([iv, tag, enc]).toString("base64url")
  );
}

export function openSettingSecret(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    // Legacy plaintext — still readable; next save will re-seal
    return stored;
  }
  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), "base64url");
  if (raw.length < 12 + 16) throw new Error("Invalid sealed secret");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", settingsKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

async function ensureSettingsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemSetting" (
      "key" TEXT PRIMARY KEY,
      "value" TEXT NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readSetting(key: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
    `SELECT value FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
    key,
  );
  return rows[0]?.value ?? null;
}

async function writeSetting(key: string, value: string) {
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
    VALUES ($1, $2, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = EXCLUDED."value",
          "updatedAt" = NOW()
  `,
    key,
    value,
  );
}

export async function loadEmailRuntimeConfig(
  opts?: { bypassCache?: boolean },
): Promise<EmailRuntimeConfig> {
  const now = Date.now();
  if (!opts?.bypassCache && now - cache.at < CACHE_MS) {
    return cache.value;
  }

  let dbKey: string | null = null;
  let dbFrom: string | null = null;
  let dbProvider: string | null = null;
  try {
    await ensureSettingsTable();
    const sealed = (await readSetting("RESEND_API_KEY"))?.trim() || null;
    if (sealed) {
      try {
        dbKey = openSettingSecret(sealed).trim() || null;
        // Upgrade legacy plaintext rows to sealed form
        if (dbKey && !sealed.startsWith(ENC_PREFIX)) {
          await writeSetting("RESEND_API_KEY", sealSettingSecret(dbKey));
        }
      } catch (err) {
        console.error("Failed to decrypt RESEND_API_KEY from DB", err);
        dbKey = null;
      }
    }
    dbFrom = (await readSetting("EMAIL_FROM"))?.trim() || null;
    dbProvider =
      (await readSetting("EMAIL_PROVIDER"))?.toLowerCase().trim() || null;
  } catch (err) {
    console.error("Failed to load email settings from DB", err);
  }

  const envKey = process.env.RESEND_API_KEY?.trim() || null;
  const envFrom = process.env.EMAIL_FROM?.trim() || null;
  const envProvider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase().trim();

  // DB overrides win so we can enable sending without a Vercel redeploy.
  const apiKey = dbKey || envKey;
  const from = dbFrom || envFrom;
  const requested = (dbProvider ||
    envProvider ||
    (apiKey ? "resend" : "console")) as "resend" | "console" | string;

  const provider: "resend" | "console" =
    apiKey && requested !== "console" ? "resend" : "console";

  const value = { apiKey, from, provider };
  cache.at = now;
  cache.value = value;
  return value;
}

export function clearEmailRuntimeCache() {
  cache.at = 0;
}

export async function saveEmailRuntimeConfig(input: {
  apiKey?: string;
  from?: string;
  provider?: "resend" | "console";
}) {
  await ensureSettingsTable();
  if (input.apiKey?.trim()) {
    await writeSetting("RESEND_API_KEY", sealSettingSecret(input.apiKey.trim()));
  }
  if (input.from?.trim()) {
    await writeSetting("EMAIL_FROM", input.from.trim());
  }
  if (input.provider) {
    await writeSetting("EMAIL_PROVIDER", input.provider);
  }
  clearEmailRuntimeCache();
  return loadEmailRuntimeConfig({ bypassCache: true });
}

export async function getEffectiveEmailProvider(): Promise<"resend" | "console"> {
  const cfg = await loadEmailRuntimeConfig();
  return cfg.provider;
}
