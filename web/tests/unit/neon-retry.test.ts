import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTransientDbError, withNeonRetry } from "../../src/server/db";

describe("isTransientDbError", () => {
  it("detects Worker 1101 and Neon connection codes", () => {
    assert.equal(isTransientDbError(new Error("error code 1101")), true);
    assert.equal(isTransientDbError(new Error("Network connection lost")), true);
    assert.equal(isTransientDbError({ code: "P1001", message: "x" }), true);
    assert.equal(isTransientDbError(new Error("Unique constraint")), false);
  });
});

describe("withNeonRetry", () => {
  it("retries transient failures then succeeds", async () => {
    let n = 0;
    const result = await withNeonRetry(async () => {
      n += 1;
      if (n < 3) throw new Error("Worker error 1101");
      return "ok";
    }, 3);
    assert.equal(result, "ok");
    assert.equal(n, 3);
  });

  it("does not retry non-transient errors", async () => {
    let n = 0;
    await assert.rejects(
      () =>
        withNeonRetry(async () => {
          n += 1;
          throw new Error("Unique constraint failed");
        }, 3),
      /Unique constraint/,
    );
    assert.equal(n, 1);
  });
});
