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
    dbKey = (await readSetting("RESEND_API_KEY"))?.trim() || null;
    dbFrom = (await readSetting("EMAIL_FROM"))?.trim() || null;
    dbProvider = (await readSetting("EMAIL_PROVIDER"))?.toLowerCase().trim() || null;
  } catch (err) {
    console.error("Failed to load email settings from DB", err);
  }

  const envKey = process.env.RESEND_API_KEY?.trim() || null;
  const envFrom = process.env.EMAIL_FROM?.trim() || null;
  const envProvider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase().trim();

  // DB overrides win so we can enable sending without a Vercel redeploy.
  const apiKey = dbKey || envKey;
  const from = dbFrom || envFrom;
  const requested = (dbProvider || envProvider || (apiKey ? "resend" : "console")) as
    | "resend"
    | "console"
    | string;

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
    await writeSetting("RESEND_API_KEY", input.apiKey.trim());
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
