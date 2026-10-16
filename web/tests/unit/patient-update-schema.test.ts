import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updatePatientSchema } from "../../src/modules/patients/service";

describe("updatePatientSchema", () => {
  it("coerces blank email and dateOfBirth to null", () => {
    const parsed = updatePatientSchema.parse({
      firstName: "Sample",
      lastName: "Editable",
      email: "",
      gpEmail: "",
      dateOfBirth: "",
      phone: "",
    });
    assert.equal(parsed.email, null);
    assert.equal(parsed.gpEmail, null);
    assert.equal(parsed.dateOfBirth, null);
    assert.equal(parsed.phone, null);
  });

  it("accepts YYYY-MM-DD date of birth", () => {
    const parsed = updatePatientSchema.parse({
      dateOfBirth: "1990-05-15",
    });
    assert.equal(parsed.dateOfBirth, "1990-05-15");
  });

  it("rejects invalid email", () => {
    assert.throws(() => updatePatientSchema.parse({ email: "not-an-email" }));
  });
});
