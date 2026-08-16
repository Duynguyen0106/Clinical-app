import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  consumeRateLimit,
  resetRateLimitStore,
} from "../../src/server/rate-limit";
import { clientIp } from "../../src/server/client-ip";
import { turnstileSecretConfigured } from "../../src/server/turnstile";

describe("consumeRateLimit", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows up to the limit then blocks", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    assert.equal(consumeRateLimit("t:a", opts).ok, true);
    assert.equal(consumeRateLimit("t:a", opts).ok, true);
    const third = consumeRateLimit("t:a", opts);
    assert.equal(third.ok, true);
    assert.equal(third.remaining, 0);
    const blocked = consumeRateLimit("t:a", opts);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSec >= 1);
  });

  it("isolates keys", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    assert.equal(consumeRateLimit("t:one", opts).ok, true);
    assert.equal(consumeRateLimit("t:two", opts).ok, true);
    assert.equal(consumeRateLimit("t:one", opts).ok, false);
  });
});

describe("clientIp", () => {
  it("prefers first X-Forwarded-For hop", () => {
    const req = new Request("http://localhost/x", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        "x-real-ip": "10.0.0.2",
      },
    });
    assert.equal(clientIp(req), "203.0.113.10");
  });

  it("falls back to x-real-ip then unknown", () => {
    const withReal = new Request("http://localhost/x", {
      headers: { "x-real-ip": "198.51.100.7" },
    });
    assert.equal(clientIp(withReal), "198.51.100.7");
    assert.equal(clientIp(new Request("http://localhost/x")), "unknown");
  });
});

describe("turnstileSecretConfigured", () => {
  it("is false when unset", () => {
    const prev = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    assert.equal(turnstileSecretConfigured(), false);
    if (prev === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = prev;
  });
});
