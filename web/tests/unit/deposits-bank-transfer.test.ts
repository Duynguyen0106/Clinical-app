import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { depositPaymentReference } from "@/modules/billing/deposits";
import { manageTokenFromHref } from "@/components/BankTransferInstructions";

describe("depositPaymentReference", () => {
  it("builds a short uppercase DEP- reference from the appointment id", () => {
    const ref = depositPaymentReference("apt_abcdefghijklmnop");
    assert.equal(ref.startsWith("DEP-"), true);
    assert.equal(ref, "DEP-IJKLMNOP");
    assert.equal(ref.length <= 12, true);
  });

  it("strips non-alphanumeric characters before slicing", () => {
    const ref = depositPaymentReference("apt-12_34-5678");
    assert.equal(ref, "DEP-12345678");
  });
});

describe("manageTokenFromHref", () => {
  it("extracts the token from a manage path", () => {
    assert.equal(
      manageTokenFromHref("/book/manage/v2.abc.def"),
      "v2.abc.def",
    );
    assert.equal(
      manageTokenFromHref(
        "https://app.example/book/manage/tok%2B1?x=1",
      ),
      "tok+1",
    );
  });

  it("ignores deposit-success and unrelated paths", () => {
    assert.equal(
      manageTokenFromHref("/book/manage/deposit-success"),
      null,
    );
    assert.equal(manageTokenFromHref("/book/clinic-slug"), null);
    assert.equal(manageTokenFromHref(null), null);
  });
});
