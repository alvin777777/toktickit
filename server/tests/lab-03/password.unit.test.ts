import { describe, it, expect } from "vitest";
import { hashPassword, passwordRuleFailure, verifyPassword } from "../../src/services/password.js";

// UNIT-01 (BR-04) — scrypt hashing round trip.
describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("Correct Horse 1");
    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("Correct Horse 1", stored)).toBe(true);
    expect(await verifyPassword("Correct Horse 2", stored)).toBe(false);
  });

  it("salts every hash, so the same password never produces the same string twice", async () => {
    const a = await hashPassword("SamePassword1");
    const b = await hashPassword("SamePassword1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("SamePassword1", a)).toBe(true);
    expect(await verifyPassword("SamePassword1", b)).toBe(true);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("anything", "plaintext-oops")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$10$abc")).toBe(false);
  });

  it("verifies the migration's precomputed Welcome123! hash (BR-46)", async () => {
    const migrated =
      "scrypt$16384$8$1$VG9rVGlja0lUTGFiM01pZw==$XPw4ksT2KxfbrLz2BSi7sKPj751q+TqR+VSuwJYicsmYtdR9+tCl6jLAnC75wcVFLqYcFTTbPiuy9pfcTo2oYA==";
    expect(await verifyPassword("Welcome123!", migrated)).toBe(true);
    expect(await verifyPassword("welcome123!", migrated)).toBe(false);
  });
});

// UNIT-02 (BR-05) — rule boundaries.
describe("password rules", () => {
  it.each([
    ["Abcdefg1", null], // exactly 8
    ["A1" + "b".repeat(70), null], // exactly 72
  ])("accepts %s", (pw, expected) => {
    expect(passwordRuleFailure(pw)).toBe(expected);
  });

  it.each([
    ["Abcdef1", "7 characters"],
    ["A1" + "b".repeat(71), "73 characters"],
    ["abcdefg1", "no uppercase"],
    ["ABCDEFG1", "no lowercase"],
    ["Abcdefgh", "no digit"],
    ["", "empty"],
  ])("rejects %s (%s)", (pw) => {
    expect(passwordRuleFailure(pw)).not.toBeNull();
  });
});
