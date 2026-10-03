import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SEEDED, asAdmin, asStaff, cookieFrom, loginAs } from "../helpers/auth.js";

let admin: string;
let adminId: number;
const stamp = Date.now();
const uniqueEmail = (tag: string) => `${tag}.${stamp}@toktickit.dev`;

beforeAll(async () => {
  admin = await asAdmin();
  adminId = (await getPrisma().user.findUniqueOrThrow({ where: { email: SEEDED.admin } })).id;
});

const list = (query = "") => request(app).get(`/api/admin/users${query}`).set("Cookie", admin);
const create = (body: object, cookie = admin) => request(app).post("/api/admin/users").set("Cookie", cookie).send(body);
const patch = (id: number, body: object, cookie = admin) => request(app).patch(`/api/admin/users/${id}`).set("Cookie", cookie).send(body);
const setInitial = (id: number, initialPassword: string) =>
  request(app).post(`/api/admin/users/${id}/initial-password`).set("Cookie", admin).send({ initialPassword });

const validUser = (tag: string, role = "IT_STAFF") => ({
  name: `Test ${tag}`,
  email: uniqueEmail(tag),
  role,
  isActive: true,
  initialPassword: "Welcome123!",
});

// API-26 (AC-22)
describe("GET /api/admin/users", () => {
  it("lists every user sorted by name without password hashes", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(11);
    const names = res.body.map((u: { name: string }) => u.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    for (const u of res.body) {
      expect(u).toMatchObject({ id: expect.any(Number), email: expect.any(String), role: expect.any(String), isActive: expect.any(Boolean) });
      expect(u).not.toHaveProperty("passwordHash");
    }
  });

  it("searches by name or email fragment and filters by role; a bogus role is ignored", async () => {
    const byName = await list("?search=emily");
    expect(byName.body.map((u: { email: string }) => u.email)).toContain(SEEDED.staffA);
    expect(byName.body.every((u: { name: string; email: string }) => /emily/i.test(u.name + u.email))).toBe(true);

    const byEmail = await list("?search=john.smith%40");
    expect(byEmail.body.map((u: { email: string }) => u.email)).toEqual([SEEDED.admin]);

    const staff = await list("?role=IT_STAFF");
    expect(staff.body.length).toBeGreaterThanOrEqual(4);
    expect(staff.body.every((u: { role: string }) => u.role === "IT_STAFF")).toBe(true);

    const bogus = await list("?role=SUPERUSER");
    expect(bogus.status).toBe(200);
    expect(bogus.body.length).toBe((await list()).body.length);
  });
});

// API-27 (AC-23, BR-20) + API-29 (BR-19, BR-41, BR-05) + API-28 (AC-24, BR-40, BR-03)
describe("POST /api/admin/users", () => {
  it("creates a user who must change the initial password at first login", async () => {
    const payload = validUser("create");
    const res = await create(payload);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: payload.name, email: payload.email, role: "IT_STAFF", isActive: true, mustChangePassword: true });
    expect(res.body).not.toHaveProperty("passwordHash");

    const login = await request(app).post("/api/auth/login").send({ email: payload.email, password: "Welcome123!" });
    expect(login.status).toBe(200);
    const blocked = await request(app).get("/api/staff/tickets").set("Cookie", cookieFrom(login));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("validates every field", async () => {
    const res = await create({ name: " ", email: "not-an-email", role: "SUPERUSER", isActive: "yes", initialPassword: "weak" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(["email", "initialPassword", "isActive", "name", "role"]);
  });

  it("rejects a duplicate email (case-insensitively) on create and on edit", async () => {
    const dup = await create({ ...validUser("dup"), email: "Emily.Davis@TokTickIT.dev" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("EMAIL_TAKEN");
    expect(dup.body.fields).toHaveProperty("email");

    const other = await create(validUser("dup2"));
    const edit = await patch(other.body.id, { email: SEEDED.staffB });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe("EMAIL_TAKEN");
  });
});

// API-30 (AC-25) + API-32 (AC-27) + API-33 (AC-28)
describe("PATCH /api/admin/users/:id", () => {
  it("edits name, email, role, and activation state", async () => {
    const created = await create(validUser("edit", "REQUESTER"));
    const res = await patch(created.body.id, { name: "Renamed Person", email: uniqueEmail("renamed"), role: "IT_STAFF", isActive: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Renamed Person", email: uniqueEmail("renamed"), role: "IT_STAFF", isActive: false });
    const inList = (await list(`?search=${uniqueEmail("renamed")}`)).body;
    expect(inList).toHaveLength(1);
    expect(inList[0].role).toBe("IT_STAFF");

    expect((await patch(created.body.id, {})).status).toBe(400);
    expect((await patch(999999, { name: "Ghost" })).status).toBe(404);
    expect((await patch(created.body.id, { role: "GOD" })).status).toBe(400);
  });

  it("refuses an Administrator deactivating their own account", async () => {
    const res = await patch(adminId, { isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SELF_DEACTIVATION");
    expect((await getPrisma().user.findUniqueOrThrow({ where: { id: adminId } })).isActive).toBe(true);
  });

  it("refuses changing the role of the last active Administrator, and allows it once another exists", async () => {
    // With a fresh seed the seeded admin is the only active Administrator. Deactivating the last
    // admin can only ever be attempted by that admin themselves (any other actor would be a second
    // active admin), where BR-42 SELF_DEACTIVATION fires first — so the reachable LAST_ADMIN path
    // is the role change, exercised here. The deactivation branch stays in the server as defence
    // in depth. The seeded admin is never deactivated, so other test files keep their sessions.
    const activeAdmins = await getPrisma().user.count({ where: { role: "ADMIN", isActive: true } });
    expect(activeAdmins).toBe(1);
    const demote = await patch(adminId, { role: "IT_STAFF" });
    expect(demote.status).toBe(409);
    expect(demote.body.code).toBe("LAST_ADMIN");
    expect((await getPrisma().user.findUniqueOrThrow({ where: { id: adminId } })).role).toBe("ADMIN");

    // A second active Administrator makes the change permissible — and deactivating that second
    // admin ends their session immediately (BR-10).
    const second = await create(validUser("admin2", "ADMIN"));
    expect(second.status).toBe(201);
    const secondCookie = await loginAs(second.body.email, "Welcome123!");
    expect((await request(app).get("/api/auth/me").set("Cookie", secondCookie)).status).toBe(200);

    const demoteSecond = await patch(second.body.id, { role: "IT_STAFF" });
    expect(demoteSecond.status).toBe(200); // two active admins → allowed
    expect((await patch(second.body.id, { role: "ADMIN" })).status).toBe(200);

    const deactivateSecond = await patch(second.body.id, { isActive: false });
    expect(deactivateSecond.status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", secondCookie)).status).toBe(401);

    // Back to one active admin: the role change is refused again.
    const demoteAgain = await patch(adminId, { role: "IT_STAFF" });
    expect(demoteAgain.status).toBe(409);
    expect(demoteAgain.body.code).toBe("LAST_ADMIN");
  });
});

// API-31 (AC-26, BR-44) + SEC-07 via the real API (AC-30, BR-10)
describe("POST /api/admin/users/:id/initial-password", () => {
  it("ends the user's sessions and forces a change at the next login", async () => {
    const created = await create(validUser("reset", "IT_STAFF"));
    const cookie = await loginAs(created.body.email, "Welcome123!");
    await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Welcome123!", newPassword: "Stronger123", confirmPassword: "Stronger123" });
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);

    const reset = await setInitial(created.body.id, "Temporary456");
    expect(reset.status).toBe(200);
    expect(reset.body.mustChangePassword).toBe(true);
    expect(JSON.stringify(reset.body)).not.toContain("Temporary456");

    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: created.body.email, password: "Stronger123" })).status).toBe(401);
    const login = await request(app).post("/api/auth/login").send({ email: created.body.email, password: "Temporary456" });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    expect((await setInitial(created.body.id, "weak")).status).toBe(400);
    expect((await setInitial(999999, "Temporary456")).status).toBe(404);
  });

  it("deactivating a signed-in user through the API ends their session immediately", async () => {
    const created = await create(validUser("deact", "IT_STAFF"));
    const cookie = await loginAs(created.body.email, "Welcome123!");
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    expect((await patch(created.body.id, { isActive: false })).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
    const login = await request(app).post("/api/auth/login").send({ email: created.body.email, password: "Welcome123!" });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe("ACCOUNT_INACTIVE");
  });
});

// API-34 (BR-45) + SEC-04 (AC-29)
describe("boundaries", () => {
  it("has no delete route", async () => {
    const res = await request(app).delete("/api/admin/users/1").set("Cookie", admin);
    expect(res.status).toBe(404);
  });

  it("refuses IT Staff on every admin route with no user data", async () => {
    const staff = await asStaff();
    const responses = [
      await request(app).get("/api/admin/users").set("Cookie", staff),
      await create(validUser("staffattempt"), staff),
      await patch(adminId, { name: "Hacked" }, staff),
      await request(app).post(`/api/admin/users/${adminId}/initial-password`).set("Cookie", staff).send({ initialPassword: "Temporary456" }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: expect.any(String), code: "FORBIDDEN" });
    }
  });
});
