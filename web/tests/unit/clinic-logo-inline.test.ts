import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INLINE_LOGO_KEY } from "@/modules/clinic/profile";

describe("clinic logo inline storage", () => {
  it("uses a stable marker distinct from file/S3 keys", () => {
    assert.equal(INLINE_LOGO_KEY, "inline");
    assert.equal(INLINE_LOGO_KEY.includes("/"), false);
    assert.notEqual(INLINE_LOGO_KEY.startsWith("clinics/"), true);
  });
});
