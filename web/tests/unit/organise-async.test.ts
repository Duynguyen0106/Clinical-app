import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { organiseAsyncEnabled } from "../../src/modules/visits/organise-flags";

describe("organiseAsyncEnabled", () => {
  it("defaults to async", () => {
    const prev = process.env.AI_ORGANISE_ASYNC;
    delete process.env.AI_ORGANISE_ASYNC;
    assert.equal(organiseAsyncEnabled(), true);
    if (prev === undefined) delete process.env.AI_ORGANISE_ASYNC;
    else process.env.AI_ORGANISE_ASYNC = prev;
  });

  it("can be forced sync", () => {
    const prev = process.env.AI_ORGANISE_ASYNC;
    process.env.AI_ORGANISE_ASYNC = "false";
    assert.equal(organiseAsyncEnabled(), false);
    process.env.AI_ORGANISE_ASYNC = "sync";
    assert.equal(organiseAsyncEnabled(), false);
    if (prev === undefined) delete process.env.AI_ORGANISE_ASYNC;
    else process.env.AI_ORGANISE_ASYNC = prev;
  });
});
