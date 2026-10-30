import { describe, it, expect, beforeAll } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { api, SEEDED, asRequester, asStaff, asStaffB } from "../helpers/auth.js";
import { forceTicket, newTicket, patchAction, postAction, recordCompletedAction, ticketByNumber, userId, validAction } from "../helpers/tickets.js";

let requester: string;
let staff: string;
let staffB: string;
let staffId: number;

beforeAll(async () => {
  [requester, staff, staffB] = await Promise.all([asRequester(), asStaff(), asStaffB()]);
  staffId = await userId(SEEDED.staffA);
});

const setStatus = (tn: string, status: string, extra: Record<string, unknown> = {}, cookie = staff) =>
  api().patch(`/api/staff/tickets/${tn}/status`).set("Cookie", cookie).send({ status, ...extra });
const detail = (tn: string, cookie = staff) => api().get(`/api/staff/tickets/${tn}`).set("Cookie", cookie);

// A claimed ticket (owner = staff A, OPEN) with one completed action, so the gate holds.
async function resolvableTicket(summary: string) {
  const tn = await newTicket(requester, summary);
  expect((await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff)).status).toBe(200);
  await recordCompletedAction(staff, tn);
  return tn;
}

const MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  CANCELLED: [],
};
const ALL = Object.keys(MATRIX) as TicketStatus[];

// API-12 (AC-10, BR-18)
describe("final transition matrix", () => {
  it("permits exactly the BR-18 pairs through the API", async () => {
    const tn = await resolvableTicket("Lab 4 full matrix");
    for (const from of ALL) {
      for (const to of ALL) {
        await forceTicket(tn, { currentStatus: from, ownerId: staffId });
        const res = await setStatus(tn, to);
        const permitted = MATRIX[from].includes(to);
        expect(res.status, `${from} -> ${to}`).toBe(permitted ? 200 : 409);
        if (!permitted) {
          expect(res.body.code).toBe("INVALID_TRANSITION");
          expect(res.body.allowed).toEqual(MATRIX[from]);
        }
      }
    }
  }, 60_000);
});

// API-13 (AC-11, BR-20)
describe("resolution gate", () => {
  it("refuses RESOLVED for each unmet requirement, via the raw API, and changes nothing", async () => {
    const tn = await newTicket(requester, "Lab 4 gate");
    await forceTicket(tn, { currentStatus: "IN_PROGRESS" });
    const noOwner = await setStatus(tn, "RESOLVED");
    expect(noOwner.status).toBe(409);
    expect(noOwner.body.code).toBe("OWNER_REQUIRED");

    await forceTicket(tn, { ownerId: staffId });
    const expectBlocked = async (blockers: string[]) => {
      const before = await ticketByNumber(tn);
      const res = await setStatus(tn, "RESOLVED");
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "RESOLUTION_BLOCKED", blockers });
      const after = await ticketByNumber(tn);
      expect([after.currentStatus, after.version, after.resolvedAt]).toEqual([before.currentStatus, before.version, before.resolvedAt]);
    };
    await expectBlocked(["NO_COMPLETED_ACTION"]); // no actions at all

    const planned = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    await patchAction(staff, tn, planned.body.id, { version: 1, status: "CANCELLED" });
    await expectBlocked(["NO_COMPLETED_ACTION"]); // only a cancelled action

    const open = await postAction(staff, tn, validAction({ status: "IN_PROGRESS", result: null }));
    await recordCompletedAction(staff, tn);
    await expectBlocked(["OPEN_ACTIONS"]);

    await patchAction(staff, tn, open.body.id, {
      version: 1, status: "COMPLETED", result: "Partly fixed", followUpRequired: true, followUpNote: "Confirm with the requester tomorrow",
      actionAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await expectBlocked(["FOLLOW_UP_PENDING"]); // latest completed action needs follow-up

    const followUp = await postAction(staff, tn, validAction({ description: "Confirmed with the requester", actionAt: new Date(Date.now() + 120_000).toISOString() }));
    expect(followUp.status).toBe(201);
    expect((await setStatus(tn, "RESOLVED")).status).toBe(200); // superseded follow-up no longer blocks
  });
});

// API-14 (AC-12, BR-23, BR-24)
describe("resolve, close, reopen", () => {
  it("sets resolvedAt, bumps version, appends history; CLOSED keeps resolvedAt; REOPENED clears it", async () => {
    const tn = await resolvableTicket("Lab 4 resolve");
    await setStatus(tn, "IN_PROGRESS");
    const before = await ticketByNumber(tn);
    const resolved = await setStatus(tn, "RESOLVED", { expectedVersion: before.version });
    expect(resolved.status).toBe(200);
    expect(resolved.body.currentStatus).toBe("RESOLVED");
    expect(resolved.body.version).toBe(before.version + 1);
    expect(resolved.body.resolvedAt).not.toBeNull();
    expect(resolved.body.statusHistory.at(-1)).toMatchObject({ fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", changedBy: { id: staffId, name: "Emily Davis" } });

    const closed = await setStatus(tn, "CLOSED");
    expect(closed.body.resolvedAt).toBe(resolved.body.resolvedAt);
    const reopened = await setStatus(tn, "REOPENED");
    expect(reopened.body.resolvedAt).toBeNull();
    expect(reopened.body.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(["NEW", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"]);
  });
});

// API-15 (AC-17, BR-21)
describe("staff detail reflects the gate", () => {
  it("omits RESOLVED and names the blockers until the gate holds", async () => {
    const tn = await newTicket(requester, "Lab 4 gated detail");
    await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff);
    await setStatus(tn, "IN_PROGRESS");
    const open = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    expect(open.status, JSON.stringify(open.body)).toBe(201);

    const blocked = await detail(tn);
    expect(blocked.body.allowedTransitions).toEqual(["WAITING_FOR_REQUESTER", "CANCELLED"]);
    expect(blocked.body.resolution).toEqual({ canResolve: false, blockers: ["NO_COMPLETED_ACTION", "OPEN_ACTIONS"] });
    expect(blocked.body.actionCounts).toEqual({ total: 1, open: 1, completed: 0, cancelled: 0 });

    await patchAction(staff, tn, open.body.id, { version: 1, status: "COMPLETED", result: "Done" });
    const ready = await detail(tn);
    expect(ready.body.allowedTransitions).toEqual(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]);
    expect(ready.body.resolution).toEqual({ canResolve: true, blockers: [] });
    expect(ready.body.actionCounts).toEqual({ total: 1, open: 0, completed: 1, cancelled: 0 });
  });
});

// API-16 (AC-14, BR-24)
describe("status history", () => {
  it("records creation, claim, and each transition once, oldest first, for staff and the requester", async () => {
    const tn = await newTicket(requester, "Lab 4 history");
    const jenId = await userId(SEEDED.requesterA);
    await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staffB);
    await setStatus(tn, "WAITING_FOR_REQUESTER");
    await setStatus(tn, "IN_PROGRESS");

    const staffView = await detail(tn);
    const steps = staffView.body.statusHistory.map((h: { fromStatus: string | null; toStatus: string; changedBy: { id: number } | null }) => [
      h.fromStatus, h.toStatus, h.changedBy?.id,
    ]);
    const kevinId = await userId(SEEDED.staffB);
    expect(steps).toEqual([
      [null, "NEW", jenId],
      ["NEW", "OPEN", kevinId],
      ["OPEN", "WAITING_FOR_REQUESTER", staffId],
      ["WAITING_FOR_REQUESTER", "IN_PROGRESS", staffId],
    ]);
    const times = staffView.body.statusHistory.map((h: { changedAt: string }) => new Date(h.changedAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const requesterView = await api().get(`/api/tickets/${tn}`).set("Cookie", requester);
    expect(requesterView.status).toBe(200);
    expect(requesterView.body.statusHistory).toEqual(staffView.body.statusHistory);
    for (const internal of ["version", "resolution", "actionCounts", "allowedTransitions"]) expect(requesterView.body).not.toHaveProperty(internal);

    // Append-only: no route updates or deletes history.
    const historyId = staffView.body.statusHistory[0].id;
    for (const method of ["patch", "delete", "put"] as const) {
      expect((await api()[method](`/api/staff/tickets/${tn}/history/${historyId}`).set("Cookie", staff)).status).toBe(404);
    }
  });
});

// API-17 (AC-15, BR-25, BR-26)
describe("stale and duplicate workflow changes", () => {
  it("rejects a stale expectedVersion on every workflow route with the current ticket", async () => {
    const tn = await newTicket(requester, "Lab 4 stale ticket");
    const v1 = (await ticketByNumber(tn)).version;
    await api().patch(`/api/staff/tickets/${tn}/it-priority`).set("Cookie", staffB).send({ itPriority: "HIGH", expectedVersion: v1 });
    const stale = [
      await setStatus(tn, "OPEN", { expectedVersion: v1 }),
      await api().patch(`/api/staff/tickets/${tn}/owner`).set("Cookie", staff).send({ ownerId: staffId, expectedVersion: v1 }),
      await api().patch(`/api/staff/tickets/${tn}/it-priority`).set("Cookie", staff).send({ itPriority: "LOW", expectedVersion: v1 }),
      await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff).send({ expectedVersion: v1 }),
    ];
    for (const res of stale) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("STALE_UPDATE");
      expect(res.body.current).toMatchObject({ ticketNumber: tn, itPriority: "HIGH", version: v1 + 1 });
    }
    const after = await ticketByNumber(tn);
    expect([after.currentStatus, after.ownerId, after.itPriority]).toEqual(["NEW", null, "HIGH"]);
  });

  it("applies two identical concurrent status requests once", async () => {
    const tn = await resolvableTicket("Lab 4 double status");
    const historyBefore = await getPrisma().ticketStatusHistory.count({ where: { ticket: { ticketNumber: tn } } });
    const results = await Promise.all([setStatus(tn, "IN_PROGRESS"), setStatus(tn, "IN_PROGRESS", {}, staffB)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await getPrisma().ticketStatusHistory.count({ where: { ticket: { ticketNumber: tn } } })).toBe(historyBefore + 1);
  });
});

// API-18 (AC-16, BR-11)
describe("cancelling a ticket", () => {
  it("cancels its open actions in the same change and leaves completed work alone", async () => {
    const tn = await resolvableTicket("Lab 4 cancel cascade");
    const planned = await postAction(staff, tn, validAction({ status: "PLANNED", result: null }));
    const running = await postAction(staffB, tn, validAction({ status: "IN_PROGRESS", result: null }));
    const res = await setStatus(tn, "CANCELLED");
    expect(res.status).toBe(200);
    expect(res.body.actionCounts).toMatchObject({ total: 3, open: 0, completed: 1, cancelled: 2 });
    for (const id of [planned.body.id, running.body.id]) {
      const a = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id } });
      expect(a.status).toBe("CANCELLED");
      expect(a.cancelledAt).not.toBeNull();
    }
    expect(res.body.statusHistory.at(-1)).toMatchObject({ fromStatus: "OPEN", toStatus: "CANCELLED" });
  });
});

// SEC-03 (AC-10, BR-18) — Requesters change no status and no ownership.
describe("requester cannot drive the workflow", () => {
  it("403s status and owner changes on the requester's own ticket", async () => {
    const tn = await newTicket(requester, "Lab 4 requester workflow");
    for (const res of [
      await setStatus(tn, "OPEN", {}, requester),
      await api().patch(`/api/staff/tickets/${tn}/owner`).set("Cookie", requester).send({ ownerId: staffId }),
      await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", requester),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect((await ticketByNumber(tn)).currentStatus).toBe("NEW");
  });
});

// API-19 (AC-13, BR-22) — the Requester's signal is advisory: no status change, but it is counted.
describe("requester 'appears resolved' indication", () => {
  it("leaves the status alone and shows up in the staff dashboard's appearsResolved list query", async () => {
    const tn = await newTicket(requester, "Lab 4 appears resolved");
    await api().post(`/api/staff/tickets/${tn}/claim`).set("Cookie", staff);
    const marked = await api().post(`/api/tickets/${tn}/requester-resolved`).set("Cookie", requester);
    expect(marked.status).toBe(200);
    expect(marked.body.currentStatus).toBe("OPEN");
    expect((await ticketByNumber(tn)).currentStatus).toBe("OPEN");

    const dash = await api().get("/api/dashboard/staff").set("Cookie", staff);
    expect(dash.body.metrics.appearsResolved.value).toBeGreaterThanOrEqual(1);
    const q = new URLSearchParams({ ...dash.body.metrics.appearsResolved.query, search: tn });
    const list = await api().get(`/api/staff/tickets?${q}`).set("Cookie", staff);
    expect(list.body.items.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([tn]);
  });
});
