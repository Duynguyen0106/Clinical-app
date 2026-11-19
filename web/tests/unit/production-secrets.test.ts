import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  assertProductionSecrets,
  getAuthSecret,
} from "../../src/server/env";

const env = process.env as Record<string, string | undefined>;

describe("production secrets", () => {
  const prev = {
    NODE_ENV: env.NODE_ENV,
    AUTH_SECRET: env.AUTH_SECRET,
    AUDIO_ENCRYPTION_KEY: env.AUDIO_ENCRYPTION_KEY,
    DATABASE_URL: env.DATABASE_URL,
    CRON_SECRET: env.CRON_SECRET,
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA: env.ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  });

  it("getAuthSecret falls back in development", () => {
    env.NODE_ENV = "development";
    delete env.AUTH_SECRET;
    assert.equal(getAuthSecret(), "treow-dev-secret-change-me");
  });

  it("getAuthSecret rejects demo secret in production", () => {
    env.NODE_ENV = "production";
    env.AUTH_SECRET = "treow-dev-secret-change-me";
    assert.throws(() => getAuthSecret(), /AUTH_SECRET/);
  });

  it("assertProductionSecrets requires real secrets in production", () => {
    env.NODE_ENV = "production";
    env.AUTH_SECRET = "a".repeat(32);
    env.AUDIO_ENCRYPTION_KEY = "b".repeat(32);
    env.DATABASE_URL = "postgres://example";
    env.CRON_SECRET = "c".repeat(24);
    env.TURNSTILE_SECRET_KEY = "ts-secret";
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "ts-site";
    delete env.ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA;
    assert.doesNotThrow(() => assertProductionSecrets());

    env.AUTH_SECRET = "short";
    assert.throws(() => assertProductionSecrets(), /AUTH_SECRET/);
  });

  it("assertProductionSecrets requires Turnstile unless explicitly opted out", () => {
    env.NODE_ENV = "production";
    env.AUTH_SECRET = "a".repeat(32);
    env.AUDIO_ENCRYPTION_KEY = "b".repeat(32);
    env.DATABASE_URL = "postgres://example";
    env.CRON_SECRET = "c".repeat(24);
    delete env.TURNSTILE_SECRET_KEY;
    delete env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete env.ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA;
    assert.throws(() => assertProductionSecrets(), /TURNSTILE/);

    env.ALLOW_PUBLIC_BOOK_WITHOUT_CAPTCHA = "1";
    assert.doesNotThrow(() => assertProductionSecrets());
  });
});
