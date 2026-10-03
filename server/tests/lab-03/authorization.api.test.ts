import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/password.js";
import { api, SEED_PASSWORD, SEEDED, asAdmin, asRequester, asRequesterB, asStaff, loginAs } from "../helpers/auth.js";

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
  let req = api()
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

    const listB = await api().get("/api/tickets").set("Cookie", cookieB).set("X-Requester-Id", String(ticket.requesterId));
    expect(listB.body.items.map((t: { id: number }) => t.id)).not.toContain(ticket.id);

    const detailB = await api()
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
    ["GET", "/api/staff/tickets/TKT-2026-000001"],
    ["POST", "/api/staff/tickets/TKT-2026-000001/claim"],
    ["PATCH", "/api/staff/tickets/TKT-2026-000001/owner"],
    ["PATCH", "/api/staff/tickets/TKT-2026-000001/it-priority"],
    ["PATCH", "/api/staff/tickets/TKT-2026-000001/status"],
    ["GET", "/api/staff/tickets/TKT-2026-000001/internal-notes"],
    ["POST", "/api/staff/tickets/TKT-2026-000001/internal-notes"],
    ["GET", "/api/admin/users"],
    ["POST", "/api/admin/users"],
    ["PATCH", "/api/admin/users/1"],
    ["POST", "/api/admin/users/1/initial-password"],
  ])("%s %s → 403 FORBIDDEN with no data", async (method, path) => {
    const cookie = await asRequester();
    const res = await api()[method.toLowerCase() as "get" | "post" | "patch"](path).set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: expect.any(String), code: "FORBIDDEN" });
  });
});

// SEC-05 (BR-14) — every Requester-only route is refused for IT Staff *and* Administrator (an
// admin-as-superuser bug would otherwise pass). Review on PR #39.
describe("Requester-only endpoints", () => {
  it("return 403 FORBIDDEN for IT Staff and Administrator on every route, while shared routes stay open", async () => {
    const owner = await asRequester();
    const created = await createTicketAs(owner, `SEC-05 owned ticket ${Date.now()}`);
    const tn = created.body.ticketNumber as string;
    const attachment = await api()
      .post(`/api/tickets/${tn}/attachments`)
      .set("Cookie", owner)
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "x.png", contentType: "image/png" });
    const attachmentId = attachment.body.id as number;

    for (const [label, cookie] of [["IT Staff", await asStaff()], ["Administrator", await asAdmin()]] as const) {
      const attempts = [
        api().get("/api/tickets").set("Cookie", cookie),
        createTicketAs(cookie, `${label} should not create`),
        api().get(`/api/tickets/${tn}`).set("Cookie", cookie),
        api().post(`/api/tickets/${tn}/attachments`).set("Cookie", cookie).attach("file", Buffer.from([1, 2, 3]), { filename: "y.png", contentType: "image/png" }),
        api().get(`/api/attachments/${attachmentId}`).set("Cookie", cookie),
        api().delete(`/api/attachments/${attachmentId}`).set("Cookie", cookie).send({ reason: "should not be allowed" }),
        api().post(`/api/tickets/${tn}/requester-resolved`).set("Cookie", cookie),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status, label).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
      // Explicitly shared routes (api-spec §3.5) keep working for both roles.
      const download = await api().get(`/api/attachments/${attachmentId}/download`).set("Cookie", cookie);
      expect(download.status, `${label} download`).toBe(200);
    }
    const stillActive = await api().get(`/api/attachments/${attachmentId}`).set("Cookie", owner);
    expect(stillActive.body.removedAt).toBeNull();
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
    ["GET", "/api/staff/tickets/TKT-2026-000001/internal-notes"],
    ["GET", "/api/tickets/TKT-2026-000001/comments"],
    ["POST", "/api/tickets/TKT-2026-000001/requester-resolved"],
    ["GET", "/api/admin/users"],
    ["PATCH", "/api/admin/users/1"],
  ])("%s %s → 401 UNAUTHENTICATED", async (method, path) => {
    const res = await api()[method.toLowerCase() as "get" | "post" | "delete" | "patch"](path);
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
    expect((await api().get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);

    const deactivate = await request(app).patch(`/api/admin/users/${user.id}`).set("Cookie", await asAdmin()).send({ isActive: false });
    expect(deactivate.status).toBe(200);

    const after = await api().get("/api/auth/me").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });
});
