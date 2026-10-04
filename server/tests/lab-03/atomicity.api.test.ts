import { describe, it, expect, vi, afterEach } from "vitest";
import * as prismaModule from "../../src/prisma.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword, verifyPassword } from "../../src/services/password.js";
import { api, asAdmin, loginAs } from "../helpers/auth.js";

// API-38 (AC-36, BR-07) — credential changes and session revocation are one transaction: when
// the transaction fails, nothing changed. Requested by review on PR #40 (and PR #43 for the
// Administrator operations, covered in the same file as they land).

// Make every $transaction on the real client fail, leaving everything else untouched.
function failTransactions() {
  const real = getPrisma();
  const proxy = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "$transaction") return async () => { throw new Error("injected transaction failure"); };
      return Reflect.get(target, prop, receiver);
    },
  });
  return vi.spyOn(prismaModule, "getPrisma").mockReturnValue(proxy as typeof real);
}

afterEach(() => vi.restoreAllMocks());

describe("atomicity under injected transaction failure", () => {
  it("change-password: 500, password unchanged, other sessions still valid", async () => {
    const email = `atomic.pw.${Date.now()}@toktickit.dev`;
    await getPrisma().user.create({ data: { name: "Atomic", email, role: "REQUESTER", passwordHash: await hashPassword("Password123!"), mustChangePassword: false } });
    const cookie = await loginAs(email);
    const other = await loginAs(email);

    const spy = failTransactions();
    const res = await api()
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Password123!", newPassword: "Changed123", confirmPassword: "Changed123" });
    spy.mockRestore();

    expect(res.status).toBe(500);
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email } });
    expect(await verifyPassword("Password123!", user.passwordHash)).toBe(true);
    expect(await verifyPassword("Changed123", user.passwordHash)).toBe(false);
    expect((await api().get("/api/auth/me").set("Cookie", other)).status).toBe(200); // not revoked
  });

  // BR-44 / BR-10 (review on PR #43)
  it("admin initial-password reset: 500, old password still works, sessions still valid", async () => {
    const email = `atomic.reset.${Date.now()}@toktickit.dev`;
    const user = await getPrisma().user.create({ data: { name: "Atomic Reset", email, role: "IT_STAFF", passwordHash: await hashPassword("Password123!"), mustChangePassword: false } });
    const session = await loginAs(email);
    const admin = await asAdmin();

    const spy = failTransactions();
    const res = await api().post(`/api/admin/users/${user.id}/initial-password`).set("Cookie", admin).send({ initialPassword: "Temporary456" });
    spy.mockRestore();

    expect(res.status).toBe(500);
    const after = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("Password123!", after.passwordHash)).toBe(true);
    expect(after.mustChangePassword).toBe(false);
    expect((await api().get("/api/auth/me").set("Cookie", session)).status).toBe(200);
  });

  it("admin deactivation: 500, user still active, sessions still valid", async () => {
    const email = `atomic.deact.${Date.now()}@toktickit.dev`;
    const user = await getPrisma().user.create({ data: { name: "Atomic Deact", email, role: "IT_STAFF", passwordHash: await hashPassword("Password123!"), mustChangePassword: false } });
    const session = await loginAs(email);
    const admin = await asAdmin();

    const spy = failTransactions();
    const res = await api().patch(`/api/admin/users/${user.id}`).set("Cookie", admin).send({ isActive: false });
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect((await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(true);
    expect((await api().get("/api/auth/me").set("Cookie", session)).status).toBe(200);
  });
});
