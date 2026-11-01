import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Prisma } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { api, asAdmin, asRequester, asStaff } from "../helpers/auth.js";
import { eventuallyEqual, forceTicket, freshUser, newTicket, patchAction, postAction, validAction } from "../helpers/tickets.js";

const ACTIVE = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const;
const dashboard = (cookie: string) => api().get("/api/dashboard/staff").set("Cookie", cookie);
const queue = (cookie: string, query: Record<string, string>) =>
  api().get(`/api/staff/tickets?${new URLSearchParams({ ...query, pageSize: "1" })}`).set("Cookie", cookie);

let requester: string;
let staff: Awaited<ReturnType<typeof freshUser>>;
let other: Awaited<ReturnType<typeof freshUser>>;

beforeAll(async () => {
  requester = await asRequester();
  [staff, other] = await Promise.all([freshUser("IT_STAFF"), freshUser("IT_STAFF")]);
});

// API-24 (AC-19, BR-29, BR-34)
describe("GET /api/dashboard/staff — calculations", () => {
  const definitions = (me: number): Record<string, Prisma.TicketWhereInput> => ({
    new: { currentStatus: "NEW" },
    inProgress: { currentStatus: "IN_PROGRESS" },
    waitingForRequester: { currentStatus: "WAITING_FOR_REQUESTER" },
    reopened: { currentStatus: "REOPENED" },
    unassigned: { currentStatus: { in: [...ACTIVE] }, ownerId: null },
    mine: { currentStatus: { in: [...ACTIVE] }, ownerId: me },
    highPriority: { currentStatus: { in: [...ACTIVE] }, itPriority: "HIGH" },
    appearsResolved: { currentStatus: { in: [...ACTIVE] }, requesterResolvedAt: { not: null } },
  });

  it("matches the direct database count and the Ticket Queue drill-down for every ticket metric", async () => {
    const tn = await newTicket(requester, "Dashboard mine", "HIGH");
    await forceTicket(tn, { currentStatus: "IN_PROGRESS", ownerId: staff.id });
    for (const [key, where] of Object.entries(definitions(staff.id))) {
      const value = await eventuallyEqual(async () => {
        const res = await dashboard(staff.cookie);
        const m = res.body.metrics[key];
        const list = await queue(staff.cookie, m.query);
        return [m.value, await getPrisma().ticket.count({ where }), list.body.totalItems];
      });
      if (key === "mine") expect(value).toBe(1); // a fresh staff member owns exactly the one above
    }
  });
});

// API-25 (AC-21, BR-29, BR-30)
describe("GET /api/dashboard/staff — my open actions and administrator counts", () => {
  it("lists only the caller's open actions on workable tickets", async () => {
    const tn = await newTicket(requester, "Dashboard my actions");
    const planned = await postAction(staff.cookie, tn, validAction({ status: "PLANNED", result: null, description: "My planned step" }));
    await postAction(staff.cookie, tn, validAction({ status: "IN_PROGRESS", result: null, description: "My running step" }));
    await postAction(staff.cookie, tn, validAction({ description: "My finished step" })); // completed — not open
    await postAction(other.cookie, tn, validAction({ status: "PLANNED", result: null, performedById: other.id, description: "Someone else's step" }));
    await postAction(other.cookie, tn, validAction({ status: "PLANNED", result: null, performedById: staff.id, description: "Assigned to me" }));
    const dead = await newTicket(requester, "Dashboard dead ticket");
    await postAction(staff.cookie, dead, validAction({ status: "PLANNED", result: null, description: "On a cancelled ticket" }));
    await forceTicket(dead, { currentStatus: "CANCELLED" }); // not workable any more (bypassing the cascade on purpose)

    const res = await dashboard(staff.cookie);
    expect(res.body.metrics.myOpenActions).toEqual({ value: 3, query: null });
    expect(res.body.myOpenActions.map((x: { description: string }) => x.description).sort()).toEqual(["Assigned to me", "My planned step", "My running step"]);
    expect(res.body.myOpenActions[0]).toMatchObject({ ticketNumber: tn, ticketSummary: "Dashboard my actions" });
    expect(res.body).not.toHaveProperty("userCounts");

    await patchAction(staff.cookie, tn, planned.body.id, { version: 1, status: "CANCELLED" });
    expect((await dashboard(staff.cookie)).body.metrics.myOpenActions.value).toBe(2);
  });

  it("adds user-account counts for Administrators, equal to the database", async () => {
    const admin = await asAdmin();
    await eventuallyEqual(async () => {
      const res = await dashboard(admin);
      const u = res.body.userCounts;
      const prisma = getPrisma();
      const db = [
        await prisma.user.count({ where: { isActive: true, role: "REQUESTER" } }),
        await prisma.user.count({ where: { isActive: true, role: "IT_STAFF" } }),
        await prisma.user.count({ where: { isActive: true, role: "ADMIN" } }),
        await prisma.user.count({ where: { isActive: false } }),
      ];
      // one reading = "all four pairs equal" (0 = mismatch) so the helper can retry the whole set
      return [u.requesters - db[0], u.itStaff - db[1], u.administrators - db[2], u.inactive - db[3], 0];
    });
  });
});

// API-26 (BR-29)
describe("GET /api/dashboard/staff — breakdowns and lists", () => {
  it("sums byStatus to all tickets, byItPriority to active tickets, and orders the lists", async () => {
    const admin = await asAdmin();
    await eventuallyEqual(async () => {
      const res = await dashboard(admin);
      const all = Object.values(res.body.byStatus as Record<string, number>).reduce((x, y) => x + y, 0);
      return [all, await getPrisma().ticket.count()];
    });
    await eventuallyEqual(async () => {
      const res = await dashboard(admin);
      const active = Object.values(res.body.byItPriority as Record<string, number>).reduce((x, y) => x + y, 0);
      return [active, await getPrisma().ticket.count({ where: { currentStatus: { in: [...ACTIVE] } } })];
    });
    const res = await dashboard(admin);
    expect(Object.keys(res.body.byStatus)).toEqual(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"]);
    expect(Object.keys(res.body.byItPriority)).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(res.body.urgent.length).toBeLessThanOrEqual(5);
    for (const t of res.body.urgent) {
      expect(t.itPriority).toBe("HIGH");
      expect(ACTIVE).toContain(t.currentStatus);
    }
    const updated = res.body.recentlyUpdated.map((t: { updatedAt: string }) => new Date(t.updatedAt).getTime());
    expect(res.body.recentlyUpdated).toHaveLength(5);
    expect([...updated].sort((x, y) => y - x)).toEqual(updated);
  });
});

// API-27 (AC-20, BR-31)
describe("GET /api/dashboard/staff — empty", () => {
  it("answers 0 and [] for the caller-scoped numbers of a brand-new staff member", async () => {
    const fresh = await freshUser("IT_STAFF");
    const res = await dashboard(fresh.cookie);
    expect(res.status).toBe(200);
    expect(res.body.metrics.mine.value).toBe(0);
    expect(res.body.metrics.myOpenActions.value).toBe(0);
    expect(res.body.myOpenActions).toEqual([]);
  });
});

// API-28 (BR-35)
describe("drill-down list filters", () => {
  it("supports statusGroup=active on both lists and appearsResolved=true on the queue; ignores unknown values", async () => {
    const r = await freshUser("REQUESTER");
    const open = await newTicket(r.cookie, "Drill open");
    const done = await newTicket(r.cookie, "Drill closed");
    await forceTicket(done, { currentStatus: "CLOSED" });
    const active = await api().get("/api/tickets?statusGroup=active").set("Cookie", r.cookie);
    expect(active.body.items.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([open]);
    const specific = await api().get("/api/tickets?statusGroup=active&currentStatus=CLOSED").set("Cookie", r.cookie);
    expect(specific.body.items.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([done]); // the specific status wins
    expect((await api().get("/api/tickets?statusGroup=bogus").set("Cookie", r.cookie)).body.totalItems).toBe(2);

    await api().post(`/api/tickets/${open}/requester-resolved`).set("Cookie", r.cookie);
    const resolvedFlag = await api().get(`/api/staff/tickets?appearsResolved=true&statusGroup=active&search=${open}`).set("Cookie", staff.cookie);
    expect(resolvedFlag.body.items.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([open]);
    const closedQueue = await api().get(`/api/staff/tickets?statusGroup=active&search=${done}`).set("Cookie", staff.cookie);
    expect(closedQueue.body.totalItems).toBe(0);
  });
});

// SEC-05 (AC-23, BR-33)
describe("staff dashboard authorization", () => {
  it("403s Requesters and 401s anonymous callers", async () => {
    const res = await dashboard(requester);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("metrics");
    expect((await request(app).get("/api/dashboard/staff")).status).toBe(401);
  });
});

// PERF-01 (AC-30) — a smoke check on the full test database, not a benchmark.
describe("dashboard performance smoke", () => {
  it("answers each dashboard within 500 ms", async () => {
    const admin = await asAdmin();
    const req = await freshUser("REQUESTER");
    const timings: Record<string, number[]> = { staff: [], requester: [] };
    for (let i = 0; i < 5; i++) {
      let t = performance.now();
      expect((await dashboard(admin)).status).toBe(200);
      timings.staff.push(performance.now() - t);
      t = performance.now();
      expect((await api().get("/api/dashboard/requester").set("Cookie", req.cookie)).status).toBe(200);
      timings.requester.push(performance.now() - t);
    }
    const tickets = await getPrisma().ticket.count();
    console.log(`PERF-01 with ${tickets} tickets — staff ms: ${timings.staff.map(Math.round)}, requester ms: ${timings.requester.map(Math.round)}`);
    for (const ms of [...timings.staff, ...timings.requester]) expect(ms).toBeLessThan(500);
  });
});
