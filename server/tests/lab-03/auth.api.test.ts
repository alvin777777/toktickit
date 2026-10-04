import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/password.js";
import { api, SEED_PASSWORD, SEEDED, cookieFrom, loginAs } from "../helpers/auth.js";

const SESSION_COOKIE_RE = /^toktickit_session=.+HttpOnly/i;

describe("POST /api/auth/login", () => {
  // API-01 (AC-01, BR-01)
  it("signs in an active user and sets an httpOnly session cookie", async () => {
    const res = await api().post("/api/auth/login").send({ email: SEEDED.requesterA, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: SEEDED.requesterA, role: "REQUESTER", mustChangePassword: false });
    expect(res.body.user).toHaveProperty("id");
    expect(res.body.user).toHaveProperty("name");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(SESSION_COOKIE_RE);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  // API-02 (AC-05, BR-01)
  it("returns the identical 401 for an unknown email and for a wrong password", async () => {
    const unknown = await api().post("/api/auth/login").send({ email: "nobody@toktickit.dev", password: SEED_PASSWORD });
    const wrong = await api().post("/api/auth/login").send({ email: SEEDED.requesterA, password: "WrongPassword1" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body.code).toBe("INVALID_CREDENTIALS");
    expect(unknown.headers["set-cookie"]).toBeUndefined();
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  // API-03 (AC-06, BR-02)
  it("tells an inactive user with correct credentials that the account is inactive, never with wrong ones", async () => {
    const correct = await api().post("/api/auth/login").send({ email: SEEDED.inactiveRequester, password: SEED_PASSWORD });
    expect(correct.status).toBe(403);
    expect(correct.body.code).toBe("ACCOUNT_INACTIVE");
    expect(correct.headers["set-cookie"]).toBeUndefined();

    const wrong = await api().post("/api/auth/login").send({ email: SEEDED.inactiveRequester, password: "WrongPassword1" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("validates missing fields (400) without touching the password check", async () => {
    const res = await api().post("/api/auth/login").send({ email: "", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty("email");
    expect(res.body.fields).toHaveProperty("password");
  });

  // API-08 (BR-03)
  it("normalizes the email (case and whitespace)", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "  Jennifer.Anderson@TokTickIT.dev ", password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(SEEDED.requesterA);
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  // API-04 (AC-07, BR-09)
  it("returns the current user, and 401 after logout with the same cookie", async () => {
    const cookie = await loginAs(SEEDED.staffA);
    const me = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe("IT_STAFF");

    const logout = await api().post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);

    const after = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("UNAUTHENTICATED");
  });

  it("logout without a session is still 204", async () => {
    const res = await api().post("/api/auth/logout");
    expect(res.status).toBe(204);
  });

  // API-09 (BR-08)
  it("treats an expired session as unauthenticated and clears the cookie", async () => {
    const cookie = await loginAs(SEEDED.requesterB);
    const token = cookie.split("=")[1];
    const { createHash } = await import("node:crypto");
    await getPrisma().session.update({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(401);
    expect(String(res.headers["set-cookie"])).toMatch(/toktickit_session=;/);
  });
});

describe("mandatory password change (BR-06, BR-07)", () => {
  // A dedicated throwaway user per run so the seeded first-login account stays untouched for E2E.
  const email = `first.login.${Date.now()}@toktickit.dev`;
  let cookie: string;

  beforeAll(async () => {
    await getPrisma().user.create({
      data: { name: "First Login", email, role: "REQUESTER", passwordHash: await hashPassword("Welcome123!"), mustChangePassword: true },
    });
    cookie = await loginAs(email, "Welcome123!");
  });

  // API-05 (AC-02)
  it("blocks every normal endpoint with 403 PASSWORD_CHANGE_REQUIRED but still serves /me", async () => {
    const tickets = await api().get("/api/tickets").set("Cookie", cookie);
    expect(tickets.status).toBe(403);
    expect(tickets.body.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const detail = await api().get("/api/tickets/TKT-2026-000001").set("Cookie", cookie);
    expect(detail.status).toBe(403);

    const me = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);
  });

  // API-06 (AC-08, BR-05, BR-07)
  it("rejects a wrong current password, a weak new one, a mismatched confirmation, and reuse", async () => {
    const wrongCurrent = await api()
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Nope12345", newPassword: "Stronger123", confirmPassword: "Stronger123" });
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.fields).toHaveProperty("currentPassword");

    const weak = await api()
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Welcome123!", newPassword: "short1A", confirmPassword: "short1A" });
    expect(weak.status).toBe(400);
    expect(weak.body.fields).toHaveProperty("newPassword");

    const mismatch = await api()
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Welcome123!", newPassword: "Stronger123", confirmPassword: "Stronger124" });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.fields).toHaveProperty("confirmPassword");

    const same = await api()
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Welcome123!", newPassword: "Welcome123!", confirmPassword: "Welcome123!" });
    expect(same.status).toBe(400);
    expect(same.body.fields.newPassword).toMatch(/differ/i);

    // Still blocked — nothing above changed anything.
    expect((await api().get("/api/tickets").set("Cookie", cookie)).status).toBe(403);
  });

  // API-06 happy path + API-07 (BR-07)
  it("accepts a valid change, unblocks the user, and ends other sessions", async () => {
    const otherSession = await loginAs(email, "Welcome123!");

    const ok = await api()
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Welcome123!", newPassword: "Stronger123", confirmPassword: "Stronger123" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.mustChangePassword).toBe(false);

    expect((await api().get("/api/tickets").set("Cookie", cookie)).status).toBe(200);
    expect((await api().get("/api/auth/me").set("Cookie", otherSession)).status).toBe(401);

    const oldLogin = await api().post("/api/auth/login").send({ email, password: "Welcome123!" });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api().post("/api/auth/login").send({ email, password: "Stronger123" });
    expect(newLogin.status).toBe(200);
    expect(cookieFrom(newLogin)).toMatch(/^toktickit_session=/);
  });
});
