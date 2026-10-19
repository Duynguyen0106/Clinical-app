import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDiaryPrivacyToAppointment,
  patientDiaryLabel,
  redactPatientForDiaryPrivacy,
} from "../../src/modules/scheduling/diary-privacy";

describe("diary privacy", () => {
  it("labels full name vs initials", () => {
    const p = { firstName: "Mina", lastName: "Patel" };
    assert.equal(patientDiaryLabel(p, "FULL_NAME"), "Mina Patel");
    assert.equal(patientDiaryLabel(p, "INITIALS"), "M.P.");
  });

  it("redacts patient fields in INITIALS mode", () => {
    const patient = {
      id: "p1",
      firstName: "Mina",
      lastName: "Patel",
      email: "mina@example.com",
      phone: "+447700900333",
      alerts: "Latex",
      dateOfBirth: new Date("1990-01-01"),
      gpName: "Dr GP",
      gpPractice: "Surgery",
      gpEmail: "gp@example.com",
      nhsNumber: "123",
    };
    const redacted = redactPatientForDiaryPrivacy(patient, "INITIALS");
    assert.equal(redacted.firstName, "M.");
    assert.equal(redacted.lastName, "P.");
    assert.equal(redacted.email, null);
    assert.equal(redacted.phone, null);
    // Clinical alerts stay visible on open desk
    assert.equal(redacted.alerts, "Latex");
    assert.equal(redacted.dateOfBirth, null);
    assert.equal(redacted.nhsNumber, null);
    // Full mode unchanged
    const full = redactPatientForDiaryPrivacy(patient, "FULL_NAME");
    assert.equal(full.firstName, "Mina");
    assert.equal(full.email, "mina@example.com");
  });

  it("applies privacy to nested appointment.patient", () => {
    const apt = {
      id: "a1",
      status: "BOOKED",
      patient: {
        firstName: "Sarah",
        lastName: "Chen",
        email: "s@example.com",
        phone: "1",
      },
    };
    const out = applyDiaryPrivacyToAppointment(apt, "INITIALS");
    assert.equal(out.patient.firstName, "S.");
    assert.equal(out.patient.lastName, "C.");
    assert.equal(out.patient.email, null);
    assert.equal(out.id, "a1");
  });
});
