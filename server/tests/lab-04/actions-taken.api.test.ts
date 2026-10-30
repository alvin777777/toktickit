import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { api, SEEDED, asAdmin, asRequester, asRequesterB, asStaff, asStaffB } from "../helpers/auth.js";
import { forceTicket, newTicket, patchAction, postAction, ticketByNumber, userId, validAction } from "../helpers/tickets.js";

let requester: string;
let requesterB: string;
let staff: string;
let staffB: string;
let admin: string;
let staffId: number;
let staffBId: number;
let inactiveStaffId: number;
let requesterId: number;

beforeAll(async () => {
  [requester, requesterB, staff, staffB, admin] = await Promise.all([asRequester(), asRequesterB(), asStaff(), asStaffB(), asAdmin()]);
  [staffId, staffBId, inactiveStaffId, requesterId] = await Promise.all([
    userId(SEEDED.staffA),
    userId(SEEDED.staffB),
    userId(SEEDED.inactiveStaff),
    userId(SEEDED.requesterA),
  ]);
});

// API-01 (AC-01, BR-03)
describe("POST /api/staff/tickets/:ticketNumber/actions", () => {
  it("saves a valid action under the right ticket with the session user as recorder and performer", async () => {
    const tn = await newTicket(requester, "Lab 4 create action");
    const before = Date.now();
    const res = await postAction(staff, tn, validAction({ createdById: 999, attachmentNotes: "See screen.png" }));
    expect(res.status).toBe(201);
    const ticket = await ticketByNumber(tn);
    expect(res.body).toMatchObject({
      ticketId: ticket.id,
      description: "Checked the device remotely.",
      result: "Device responds normally.",
      status: "COMPLETED",
      performedBy: { id: staffId, name: "Emily Davis", role: "IT_STAFF" },
      createdBy: { id: staffId, name: "Emily Davis", role: "IT_STAFF" },
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: "See screen.png",
      version: 1,
      cancelledAt: null,
    });
    expect(new Date(res.body.completedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(res.body.performedBy).not.toHaveProperty("email");
  });

  // API-02 (AC-01, AC-02, BR-02, BR-03)
  it("lets one staff member record an action performed by another, independent of the Ticket Owner", async () => {
    const tn = await newTicket(requester, "Lab 4 performer differs");
    const lisa = await userId("lisa.martinez@toktickit.dev");
    await forceTicket(tn, { currentStatus: "OPEN", ownerId: lisa });
    const res = await postAction(staff, tn, validAction({ performedById: staffBId }));
    expect(res.status).toBe(201);
    expect(res.body.performedBy.id).toBe(staffBId);
    expect(res.body.createdBy.id).toBe(staffId);
    expect((await ticketByNumber(tn)).ownerId).toBe(lisa);
  });

  // API-04 (AC-03, BR-03)
  it("rejects an inactive, Requester, or unknown performer on create", async () => {
    const tn = await newTicket(requester, "Lab 4 bad performer");
    for (const performedById of [inactiveStaffId, requesterId, 9_999_999]) {
      const res = await postAction(staff, tn, validAction({ performedById }));
      expect(res.status).toBe(400);
      expect(res.body.fields.performedById).toBe("Select an active IT Staff or Administrator.");
    }
    expect(await getPrisma().actionTaken.count({ where: { ticket: { ticketNumber: tn } } })).toBe(0);
  });

  // API-05 (AC-04, BR-04..BR-07)
  it("returns every invalid field at once and stores nothing", async () => {
    const tn = await newTicket(requester, "Lab 4 invalid action");
    const ticket = await ticketByNumber(tn);
    const res = await postAction(staff, tn, {
      actionAt: new Date(ticket.createdAt.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      description: "abc",
      result: "",
      status: "COMPLETED",
      followUpRequired: true,
      attachmentNotes: "x".repeat(501),
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(["actionAt", "attachmentNotes", "description", "followUpNote", "result"]);

    const future = await postAction(staff, tn, validAction({ actionAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }));
    expect(future.status).toBe(400);
    expect(future.body.fields.actionAt).toBe("Action date cannot be in the future.");
    const planned = await postAction(staff, tn, validAction({ status: "PLANNED", result: null, actionAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }));
    expect(planned.status).toBe(201);
    const badStatus = await postAction(staff, tn, validAction({ status: "CANCELLED" }));
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.fields.status).toBe("Select a valid status.");
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it("returns 404 for an unknown ticket", async () => {
    expect((await postAction(staff, "TKT-1999-000000", validAction())).status).toBe(404);
  });
});

// API-03 (AC-02, BR-16)
describe("GET /api/staff/tickets/:ticketNumber/actions", () => {
  it("lists every action by Action Date/Time, then id, whoever performed it", async () => {
    const tn = await newTicket(requester, "Lab 4 ordering");
    // The ticket was created a moment ago, so every valid actionAt lies between now and the 5-minute skew.
    const later = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const same = new Date(Date.now() + 60 * 1000).toISOString();
    const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const c = await postAction(admin, tn, validAction({ actionAt: later, description: "Latest" }));
    const a = await postAction(staff, tn, validAction({ actionAt: same, description: "Same time (A)" }));
    const b = await postAction(staffB, tn, validAction({ actionAt: same, description: "Same time (B)" }));
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    // t0 is before the ticket existed, so it must be refused (BR-04) — the list stays at three.
    expect((await postAction(staff, tn, validAction({ actionAt: t0 }))).status).toBe(400);

    const res = await api().get(`/api/staff/tickets/${tn}/actions`).set("Cookie", staffB);
    expect(res.status).toBe(200);
    expect(res.body.map((x: { id: number }) => x.id)).toEqual([a.body.id, b.body.id, c.body.id]);
    expect(res.body.map((x: { performedBy: { name: string } }) => x.performedBy.name)).toEqual(["Emily Davis", "Kevin Patel", "John Smith"]);
  });

  it("returns [] for a ticket without actions", async () => {
    const tn = await newTicket(requester, "Lab 4 no actions");
    const res = await api().get(`/api/staff/tickets/${tn}/actions`).set("Cookie", staff);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("PATCH /api/staff/tickets/:ticketNumber/actions/:actionId", () => {
  // API-06 (AC-05, BR-08)
  it("edits an open action, then starts and completes it; another is cancelled", async () => {
    const tn = await newTicket(requester, "Lab 4 edit action");
    const created = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    expect(created.status).toBe(201);
    const id = created.body.id;

    const edited = await patchAction(staff, tn, id, { version: 1, description: "Replace the keyboard", attachmentNotes: "keyboard.jpg", performedById: staffBId });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ description: "Replace the keyboard", attachmentNotes: "keyboard.jpg", version: 2, status: "PLANNED" });
    expect(edited.body.performedBy.id).toBe(staffBId);
    expect(edited.body.createdBy.id).toBe(staffId); // BR-03 — recorder never changes

    const started = await patchAction(staffB, tn, id, { version: 2, status: "IN_PROGRESS" });
    expect(started.body).toMatchObject({ status: "IN_PROGRESS", version: 3, completedAt: null });

    const noResult = await patchAction(staffB, tn, id, { version: 3, status: "COMPLETED" });
    expect(noResult.status).toBe(400);
    expect(noResult.body.fields.result).toBe("Result is required to complete an action.");

    const done = await patchAction(staffB, tn, id, { version: 3, status: "COMPLETED", result: "Keyboard replaced." });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: "COMPLETED", result: "Keyboard replaced.", version: 4 });
    expect(done.body.completedAt).not.toBeNull();

    const other = await postAction(staff, tn, validAction({ status: "PLANNED", result: null, description: "Order spare keyboard" }));
    const cancelled = await patchAction(staff, tn, other.body.id, { version: 1, status: "CANCELLED" });
    expect(cancelled.body).toMatchObject({ status: "CANCELLED", version: 2 });
    expect(cancelled.body.cancelledAt).not.toBeNull();
  });

  it("rejects an inactive performer on edit (AC-03)", async () => {
    const tn = await newTicket(requester, "Lab 4 edit bad performer");
    const created = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    const res = await patchAction(staff, tn, created.body.id, { version: 1, performedById: inactiveStaffId });
    expect(res.status).toBe(400);
    expect(res.body.fields.performedById).toBeDefined();
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.body.id } })).performedById).toBe(staffId);
  });

  // API-07 (AC-05, BR-08, BR-09)
  it("treats Completed and Cancelled as final and refuses moves outside the matrix", async () => {
    const tn = await newTicket(requester, "Lab 4 final action");
    const done = await postAction(staff, tn, validAction());
    const edit = await patchAction(staff, tn, done.body.id, { version: 1, description: "Rewrite history" });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe("ACTION_FINAL");

    const planned = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    await patchAction(staff, tn, planned.body.id, { version: 1, status: "CANCELLED" });
    const revive = await patchAction(staff, tn, planned.body.id, { version: 2, status: "IN_PROGRESS" });
    expect(revive.status).toBe(409);
    expect(revive.body.code).toBe("ACTION_FINAL");

    const running = await postAction(staff, tn, validAction({ status: "IN_PROGRESS", result: null }));
    const back = await patchAction(staff, tn, running.body.id, { version: 1, status: "PLANNED" });
    expect(back.status).toBe(409);
    expect(back.body).toMatchObject({ code: "INVALID_ACTION_TRANSITION", allowed: ["COMPLETED", "CANCELLED"] });
  });

  // API-08 (AC-06, BR-13)
  it("rejects a stale version with the current action, sequentially and under a race", async () => {
    const tn = await newTicket(requester, "Lab 4 stale action");
    const created = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    const id = created.body.id;

    const first = await patchAction(staff, tn, id, { version: 1, description: "Emily's edit" });
    const second = await patchAction(staffB, tn, id, { version: 1, description: "Kevin's edit" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("STALE_UPDATE");
    expect(second.body.current).toMatchObject({ id, description: "Emily's edit", version: 2 });

    const race = await Promise.all([
      patchAction(staff, tn, id, { version: 2, description: "Race one" }),
      patchAction(staffB, tn, id, { version: 2, description: "Race two" }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id } })).version).toBe(3);

    const missing = await patchAction(staff, tn, id, { description: "No version" });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.version).toBe("Version is required.");
  });

  // API-11 (BR-01)
  it("404s when the action is addressed through another ticket", async () => {
    const tnA = await newTicket(requester, "Lab 4 action owner ticket");
    const tnB = await newTicket(requester, "Lab 4 other ticket");
    const created = await postAction(staff, tnA, validAction({ status: "PLANNED", result: null }));
    const res = await patchAction(staff, tnB, created.body.id, { version: 1, description: "Moved?" });
    expect(res.status).toBe(404);
    expect((await patchAction(staff, "TKT-1999-000000", created.body.id, { version: 1 })).status).toBe(404);
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.body.id } })).ticketId).toBe((await ticketByNumber(tnA)).id);
  });
});

// API-09 (AC-07, BR-14)
describe("idempotent create", () => {
  it("creates one action for repeated and concurrent submissions with the same clientRequestId", async () => {
    const tn = await newTicket(requester, "Lab 4 double click");
    const clientRequestId = randomUUID();
    const first = await postAction(staff, tn, validAction({ clientRequestId }));
    const retry = await postAction(staff, tn, validAction({ clientRequestId }));
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);

    const raceId = randomUUID();
    const race = await Promise.all([1, 2, 3].map(() => postAction(staff, tn, validAction({ clientRequestId: raceId, description: "Raced create" }))));
    expect(race.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(race.map((r) => r.body.id)).size).toBe(1);
    expect(await getPrisma().actionTaken.count({ where: { ticket: { ticketNumber: tn } } })).toBe(2);

    const other = await newTicket(requester, "Lab 4 reused request id");
    const reused = await postAction(staff, other, validAction({ clientRequestId }));
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("DUPLICATE_REQUEST");
  });
});

// API-10 (AC-09, BR-10)
describe("ticket must be workable", () => {
  it("refuses creates and edits on Resolved, Closed, and Cancelled tickets", async () => {
    for (const status of ["RESOLVED", "CLOSED", "CANCELLED"] as const) {
      const tn = await newTicket(requester, `Lab 4 not workable ${status}`);
      const open = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
      await forceTicket(tn, { currentStatus: status, ownerId: staffId });
      const create = await postAction(staff, tn, validAction());
      expect(create.status).toBe(409);
      expect(create.body.code).toBe("TICKET_NOT_WORKABLE");
      const edit = await patchAction(staff, tn, open.body.id, { version: 1, description: "Late edit" });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe("TICKET_NOT_WORKABLE");
    }
  });
});

// SEC-01 (AC-08, BR-15)
describe("Requester access", () => {
  it("is read-only on own tickets, 404 on others', 403 on every staff action route", async () => {
    const tn = await newTicket(requester, "Lab 4 requester view");
    const created = await postAction(staff, tn, validAction({ followUpRequired: true, followUpNote: "Check again Monday" }));

    const own = await api().get(`/api/tickets/${tn}/actions`).set("Cookie", requester);
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0]).toMatchObject({ id: created.body.id, followUpNote: "Check again Monday", performedBy: { name: "Emily Davis" } });

    expect((await api().get(`/api/tickets/${tn}/actions`).set("Cookie", requesterB)).status).toBe(404);
    expect((await api().get(`/api/tickets/TKT-1999-000000/actions`).set("Cookie", requester)).status).toBe(404);

    const forbidden = [
      await api().get(`/api/staff/tickets/${tn}/actions`).set("Cookie", requester),
      await postAction(requester, tn, validAction()),
      await patchAction(requester, tn, created.body.id, { version: 1, description: "Requester edit" }),
    ];
    for (const res of forbidden) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect((await api().get(`/api/tickets/${tn}/actions`).set("Cookie", staff)).status).toBe(403);
    expect(await getPrisma().actionTaken.count({ where: { ticket: { ticketNumber: tn } } })).toBe(1);
  });
});

// SEC-02 (AC-23, BR-26 / L3 BR-09a)
describe("unauthenticated and forged requests", () => {
  it("401s without a session and refuses a forged Origin before doing anything", async () => {
    const tn = await newTicket(requester, "Lab 4 csrf action");
    expect((await request(app).get(`/api/staff/tickets/${tn}/actions`)).status).toBe(401);
    expect((await request(app).get(`/api/tickets/${tn}/actions`)).status).toBe(401);
    expect((await api().post(`/api/staff/tickets/${tn}/actions`).send(validAction())).status).toBe(401);

    const forged = await request(app).post(`/api/staff/tickets/${tn}/actions`).set("Cookie", staff).set("Origin", "https://evil.example").send(validAction());
    expect(forged.status).toBe(403);
    expect(forged.body.code).toBe("CSRF_REJECTED");
    const created = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    const forgedPatch = await request(app)
      .patch(`/api/staff/tickets/${tn}/actions/${created.body.id}`)
      .set("Cookie", staff)
      .send({ version: 1, description: "Forged edit" });
    expect(forgedPatch.status).toBe(403);
    expect(await getPrisma().actionTaken.count({ where: { ticket: { ticketNumber: tn } } })).toBe(1);
    expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.body.id } })).version).toBe(1);
  });
});
