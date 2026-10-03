import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { api, SEEDED, asAdmin, asRequester, asStaff, asStaffB } from "../helpers/auth.js";

let requester: string;
let staff: string;
let staffB: string;
let staffId: number;
let staffBId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  requester = await asRequester();
  staff = await asStaff();
  staffB = await asStaffB();
  const prisma = getPrisma();
  staffId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.staffA } })).id;
  staffBId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.staffB } })).id;
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
});

// Every test creates its own fresh NEW ticket as the requester, so tests never share state.
async function newTicket(summary: string): Promise<string> {
  const res = await api()
    .post("/api/tickets")
    .set("Cookie", requester)
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", "MEDIUM");
  expect(res.status).toBe(201);
  return res.body.ticketNumber as string;
}

const patch = (tn: string, path: string, body: object, cookie = staff) =>
  api().patch(`/api/staff/tickets/${tn}/${path}`).set("Cookie", cookie).send(body);
const setStatus = (tn: string, status: string, cookie = staff) => patch(tn, "status", { status }, cookie);

// API-13 (FR-14)
describe("GET /api/staff/tickets/:ticketNumber", () => {
  it("returns any requester's ticket with requester, category, owner, transitions, attachments", async () => {
    const tn = await newTicket("Staff detail happy path");
    const res = await api().get(`/api/staff/tickets/${tn}`).set("Cookie", staff);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ticketNumber: tn,
      requester: { name: "Jennifer Anderson", email: SEEDED.requesterA },
      category: { id: categoryId, name: expect.any(String) },
      relatedSystem: { id: relatedSystemId, name: expect.any(String) },
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: "NEW",
      owner: null,
      requesterResolvedAt: null,
      allowedTransitions: ["OPEN", "CANCELLED"],
      attachments: [],
    });
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("404s an unknown ticket number", async () => {
    const res = await api().get("/api/staff/tickets/TKT-1999-000000").set("Cookie", staff);
    expect(res.status).toBe(404);
  });
});

// API-14 (AC-15, BR-26, BR-27)
describe("POST /api/staff/tickets/:ticketNumber/claim", () => {
  it("claims an unassigned NEW ticket (owner = caller, status OPEN) and refuses a second claimant", async () => {
    const tn = await newTicket("Claim me");
    const claim = await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff);
    expect(claim.status).toBe(200);
    expect(claim.body.owner.id).toBe(staffId);
    expect(claim.body.currentStatus).toBe("OPEN");

    const again = await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staffB);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_ASSIGNED");
    expect(again.body.error).toMatch(/Emily Davis/);

    // Claiming your own ticket again is harmless.
    const mine = await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff);
    expect(mine.status).toBe(200);
    expect(mine.body.owner.id).toBe(staffId);
  });
});

// API-15 (AC-16, BR-23)
describe("PATCH /api/staff/tickets/:ticketNumber/owner", () => {
  it("assigns active staff, rejects inactive staff and requesters, and can unassign", async () => {
    const tn = await newTicket("Owner changes");
    const prisma = getPrisma();
    const inactiveStaff = await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.inactiveStaff } });
    const requesterUser = await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.requesterB } });

    const ok = await patch(tn, "owner", { ownerId: staffBId });
    expect(ok.status).toBe(200);
    expect(ok.body.owner.id).toBe(staffBId);
    expect(ok.body.currentStatus).toBe("OPEN"); // BR-26

    const inactive = await patch(tn, "owner", { ownerId: inactiveStaff.id });
    expect(inactive.status).toBe(400);
    expect(inactive.body.fields).toHaveProperty("ownerId");

    const notStaff = await patch(tn, "owner", { ownerId: requesterUser.id });
    expect(notStaff.status).toBe(400);

    const garbage = await patch(tn, "owner", { ownerId: "7" });
    expect(garbage.status).toBe(400);

    const unassign = await patch(tn, "owner", { ownerId: null });
    expect(unassign.status).toBe(200);
    expect(unassign.body.owner).toBeNull();
  });
});

// API-16 (AC-17, BR-24)
describe("PATCH /api/staff/tickets/:ticketNumber/it-priority", () => {
  it("changes IT Priority only, and rejects unknown values", async () => {
    const tn = await newTicket("Priority change");
    const res = await patch(tn, "it-priority", { itPriority: "HIGH" });
    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe("HIGH");
    expect(res.body.requestedPriority).toBe("MEDIUM");

    const bad = await patch(tn, "it-priority", { itPriority: "URGENT" });
    expect(bad.status).toBe(400);
    expect(bad.body.fields).toHaveProperty("itPriority");
  });
});

// API-17 (AC-18, BR-30) + API-18 (AC-19, BR-29) + API-19 (BR-28)
describe("PATCH /api/staff/tickets/:ticketNumber/status", () => {
  it("walks the permitted path and rejects a non-permitted jump with the allowed list", async () => {
    const tn = await newTicket("Status walk");
    const jump = await setStatus(tn, "CLOSED");
    expect(jump.status).toBe(409);
    expect(jump.body.code).toBe("INVALID_TRANSITION");
    expect(jump.body.allowed).toEqual(["OPEN", "CANCELLED"]);

    await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff); // NEW → OPEN with owner
    for (const [to, allowedAfter] of [
      ["IN_PROGRESS", ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]],
      ["RESOLVED", ["CLOSED", "REOPENED"]],
      ["CLOSED", ["REOPENED"]],
      ["REOPENED", ["IN_PROGRESS", "RESOLVED", "CANCELLED"]],
    ] as const) {
      const res = await setStatus(tn, to);
      expect(res.status, `→ ${to}`).toBe(200);
      expect(res.body.currentStatus).toBe(to);
      expect(res.body.allowedTransitions).toEqual(allowedAfter);
    }

    const unknown = await setStatus(tn, "DONE");
    expect(unknown.status).toBe(400);
  });

  it("refuses RESOLVED without an owner, and refuses unassigning a RESOLVED ticket", async () => {
    const tn = await newTicket("Resolve needs owner");
    await setStatus(tn, "OPEN");
    await setStatus(tn, "IN_PROGRESS");
    const noOwner = await setStatus(tn, "RESOLVED");
    expect(noOwner.status).toBe(409);
    expect(noOwner.body.code).toBe("OWNER_REQUIRED");

    await patch(tn, "owner", { ownerId: staffId });
    expect((await setStatus(tn, "RESOLVED")).status).toBe(200);
    const unassign = await patch(tn, "owner", { ownerId: null });
    expect(unassign.status).toBe(409);
    expect(unassign.body.code).toBe("OWNER_REQUIRED");
  });

  it("freezes owner / priority / claim on a CANCELLED ticket, but lets CLOSED reopen", async () => {
    const tn = await newTicket("Terminal checks");
    expect((await setStatus(tn, "CANCELLED")).status).toBe(200);
    for (const res of [
      await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff),
      await patch(tn, "it-priority", { itPriority: "LOW" }),
      await patch(tn, "owner", { ownerId: staffId }),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("TICKET_TERMINAL");
    }
    expect((await setStatus(tn, "REOPENED")).status).toBe(409); // CANCELLED is terminal

    const tn2 = await newTicket("Close then reopen");
    await api().post(`/api/staff/tickets/${tn2}/claim`).set("Cookie", staff);
    await setStatus(tn2, "IN_PROGRESS");
    await setStatus(tn2, "RESOLVED");
    await setStatus(tn2, "CLOSED");
    const reopen = await setStatus(tn2, "REOPENED");
    expect(reopen.status).toBe(200);
  });

  // SEC-08 (BR-15) — Administrators are explicitly permitted the IT Staff operations.
  it("lets an Administrator claim and change status", async () => {
    const admin = await asAdmin();
    const tn = await newTicket("Admin operates");
    const claim = await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", admin);
    expect(claim.status).toBe(200);
    expect(claim.body.owner.role).toBe("ADMIN");
    expect((await setStatus(tn, "IN_PROGRESS", admin)).status).toBe(200);
  });
});
