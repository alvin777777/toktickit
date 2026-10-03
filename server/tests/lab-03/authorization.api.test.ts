import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/password.js";
import { SEED_PASSWORD, SEEDED, asAdmin, asRequester, asRequesterB, asStaff, loginAs } from "../helpers/auth.js";

// Direct API authorization evidence (docs/lab-03/tests.md SEC-01..SEC-08). Staff and Admin routes
// are added to the route tables below in Issues 3–5 as they come into existence.

let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
});

function createTicketAs(cookie: string, summary: string, extraFields: Record<string, string> = {}) {
  let req = request(app)
    .post("/api/tickets")
    .set("Cookie", cookie)
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", "LOW");
  for (const [k, v] of Object.entries(extraFields)) req = req.field(k, v);
  return req;
}

// SEC-01 (AC-03, BR-13)
describe("client-supplied requester identity is ignored", () => {
  it("creates for the session user, lists only theirs, and 404s the other's ticket", async () => {
    const cookieA = await asRequester();
    const cookieB = await asRequesterB();
    const idB = (await getPrisma().user.findUniqueOrThrow({ where: { email: SEEDED.requesterB } })).id;

    const created = await createTicketAs(cookieA, `SEC-01 spoof ${Date.now()}`, { requesterId: String(idB) })
      .set("X-Requester-Id", String(idB));
    expect(created.status).toBe(201);
    const ticket = await getPrisma().ticket.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(ticket.requesterId).not.toBe(idB);

    const listB = await request(app).get("/api/tickets").set("Cookie", cookieB).set("X-Requester-Id", String(ticket.requesterId));
    expect(listB.body.items.map((t: { id: number }) => t.id)).not.toContain(ticket.id);

    const detailB = await request(app)
      .get(`/api/tickets/${created.body.ticketNumber}`)
      .set("Cookie", cookieB)
      .set("X-Requester-Id", String(ticket.requesterId));
    expect(detailB.status).toBe(404);
  });
});

// SEC-03 (AC-09, BR-14) — a Requester is refused by every /api/staff/* route before any lookup.
describe("Requester calling IT Staff routes", () => {
  it.each([
    ["GET", "/api/staff/tickets"],
    ["GET", "/api/staff/assignees"],
  ])("%s %s → 403 FORBIDDEN with no data", async (method, path) => {
    const cookie = await asRequester();
    const res = await request(app)[method.toLowerCase() as "get" | "post" | "patch"](path).set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: expect.any(String), code: "FORBIDDEN" });
  });
});

// SEC-05 (BR-14) — Requester-only operations are refused for staff.
describe("Requester-only endpoints", () => {
  it("return 403 FORBIDDEN for IT Staff and Administrator", async () => {
    for (const cookie of [await asStaff(), await asAdmin()]) {
      const list = await request(app).get("/api/tickets").set("Cookie", cookie);
      expect(list.status).toBe(403);
      expect(list.body.code).toBe("FORBIDDEN");
      const create = await createTicketAs(cookie, "staff should not create");
      expect(create.status).toBe(403);
    }
  });
});

// SEC-06 (FR-07, BR-16) — one route per group with no session.
describe("unauthenticated access", () => {
  it.each([
    ["GET", "/api/tickets"],
    ["POST", "/api/tickets"],
    ["GET", "/api/tickets/TKT-2026-000001"],
    ["GET", "/api/attachments/1"],
    ["GET", "/api/attachments/1/download"],
    ["DELETE", "/api/attachments/1"],
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/change-password"],
    ["GET", "/api/staff/tickets"],
    ["GET", "/api/staff/assignees"],
  ])("%s %s → 401 UNAUTHENTICATED", async (method, path) => {
    const res = await request(app)[method.toLowerCase() as "get" | "post" | "delete"](path);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });
});

// SEC-07 (AC-30, BR-10) — deactivation ends access immediately.
describe("deactivation revokes sessions", () => {
  it("a user deactivated mid-session gets 401 on the next request", async () => {
    const email = `revoke.${Date.now()}@toktickit.dev`;
    const user = await getPrisma().user.create({
      data: { name: "Revoke Me", email, role: "IT_STAFF", passwordHash: await hashPassword(SEED_PASSWORD), mustChangePassword: false },
    });
    const cookie = await loginAs(email);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);

    // Until the Administrator API lands (Issue 5) this is the direct DB effect the API will have.
    await getPrisma().user.update({ where: { id: user.id }, data: { isActive: false } });
    await getPrisma().session.deleteMany({ where: { userId: user.id } });

    const after = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });
});
