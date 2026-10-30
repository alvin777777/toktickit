import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { api, asAdmin, asStaff } from "../helpers/auth.js";
import { forceTicket, freshUser, newTicket } from "../helpers/tickets.js";

const DAY = 24 * 60 * 60 * 1000;
const dashboard = (cookie: string) => api().get("/api/dashboard/requester").set("Cookie", cookie);
const myTickets = (cookie: string, query: Record<string, string>) =>
  api().get(`/api/tickets?${new URLSearchParams({ ...query, pageSize: "50" })}`).set("Cookie", cookie);

let a: Awaited<ReturnType<typeof freshUser>>;
let b: Awaited<ReturnType<typeof freshUser>>;
const aTickets: Record<string, string> = {};

beforeAll(async () => {
  [a, b] = await Promise.all([freshUser("REQUESTER"), freshUser("REQUESTER")]);
  // A's tickets cover every metric and list; B gets tickets that must never show up for A.
  const plan: [string, Parameters<typeof forceTicket>[1] & { resolvedDaysAgo?: number; updatedDaysAgo?: number }][] = [
    ["new", { currentStatus: "NEW" }],
    ["open", { currentStatus: "OPEN" }],
    ["waiting", { currentStatus: "WAITING_FOR_REQUESTER", updatedDaysAgo: 3 }],
    ["waiting2", { currentStatus: "WAITING_FOR_REQUESTER", updatedDaysAgo: 1 }],
    ["resolvedRecent", { currentStatus: "RESOLVED", resolvedDaysAgo: 1, updatedDaysAgo: 2 }],
    ["resolvedOld", { currentStatus: "RESOLVED", resolvedDaysAgo: 8, updatedDaysAgo: 8 }],
    ["closed", { currentStatus: "CLOSED", resolvedDaysAgo: 3 }],
    ["cancelled", { currentStatus: "CANCELLED" }],
  ];
  for (const [key, { resolvedDaysAgo, updatedDaysAgo, ...state }] of plan) {
    const tn = await newTicket(a.cookie, `Dashboard A ${key}`);
    await forceTicket(tn, state);
    await getPrisma().ticket.update({
      where: { ticketNumber: tn },
      data: {
        ...(resolvedDaysAgo !== undefined ? { resolvedAt: new Date(Date.now() - resolvedDaysAgo * DAY) } : {}),
        ...(updatedDaysAgo !== undefined ? { updatedAt: new Date(Date.now() - updatedDaysAgo * DAY) } : {}),
      },
    });
    aTickets[key] = tn;
  }
  for (const s of ["WAITING_FOR_REQUESTER", "RESOLVED"] as const) {
    const tn = await newTicket(b.cookie, `Dashboard B ${s}`);
    await forceTicket(tn, { currentStatus: s });
  }
}, 60_000);

// API-20 (AC-18, BR-28)
describe("GET /api/dashboard/requester — ownership", () => {
  it("returns only the caller's tickets in every list", async () => {
    const res = await dashboard(a.cookie);
    expect(res.status).toBe(200);
    const listed = [...res.body.needsAttention, ...res.body.recentlyUpdated, ...res.body.recentlyResolved].map((t: { ticketNumber: string }) => t.ticketNumber);
    const owned = await getPrisma().ticket.findMany({ where: { ticketNumber: { in: listed } }, select: { requesterId: true } });
    expect(owned.length).toBeGreaterThan(0);
    expect(new Set(owned.map((t) => t.requesterId))).toEqual(new Set([a.id]));
    expect(JSON.stringify(res.body)).not.toContain("Dashboard B");
  });
});

// API-21 (AC-19, BR-28, BR-34)
describe("GET /api/dashboard/requester — calculations", () => {
  it("equals the direct database count and the drill-down list for every metric", async () => {
    const res = await dashboard(a.cookie);
    const mine = { requesterId: a.id };
    const expected = {
      open: await getPrisma().ticket.count({ where: { ...mine, currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] } } }),
      waitingForMe: await getPrisma().ticket.count({ where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" } }),
      resolved: await getPrisma().ticket.count({ where: { ...mine, currentStatus: "RESOLVED" } }),
      closed: await getPrisma().ticket.count({ where: { ...mine, currentStatus: "CLOSED" } }),
    };
    expect(expected).toEqual({ open: 4, waitingForMe: 2, resolved: 2, closed: 1 }); // the fixture above
    for (const [key, count] of Object.entries(expected)) {
      const m = res.body.metrics[key];
      expect(m.value, key).toBe(count);
      const list = await myTickets(a.cookie, m.query);
      expect(list.body.totalItems, `${key} drill-down`).toBe(count);
    }
  });
});

// API-22 (AC-20, BR-31)
describe("GET /api/dashboard/requester — empty", () => {
  it("answers 0 and [] for a requester with no tickets", async () => {
    const empty = await freshUser("REQUESTER");
    const res = await dashboard(empty.cookie);
    expect(res.status).toBe(200);
    for (const m of Object.values(res.body.metrics) as { value: number }[]) expect(m.value).toBe(0);
    expect([res.body.needsAttention, res.body.recentlyUpdated, res.body.recentlyResolved]).toEqual([[], [], []]);
    expect(res.body.recentWindowDays).toBe(7);
  });
});

// API-23 (BR-27, BR-28)
describe("GET /api/dashboard/requester — list rules", () => {
  it("orders and windows each list and caps it at 5", async () => {
    const res = await dashboard(a.cookie);
    expect(res.body.needsAttention.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      aTickets.resolvedOld, aTickets.waiting, aTickets.resolvedRecent, aTickets.waiting2,
    ]); // WAITING / RESOLVED only, oldest update first
    expect(res.body.recentlyResolved.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([aTickets.resolvedRecent, aTickets.closed]);
    expect(res.body.recentlyUpdated).toHaveLength(5);
    const times = res.body.recentlyUpdated.map((t: { updatedAt: string }) => new Date(t.updatedAt).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(Object.keys(res.body.recentlyUpdated[0]).sort()).toEqual(["currentStatus", "itPriority", "resolvedAt", "summary", "ticketNumber", "updatedAt"]);
  });
});

// SEC-04 (AC-23, BR-33)
describe("requester dashboard authorization", () => {
  it("403s IT Staff and Administrators and 401s anonymous callers", async () => {
    for (const cookie of [await asStaff(), await asAdmin()]) {
      const res = await dashboard(cookie);
      expect(res.status).toBe(403);
      expect(res.body).not.toHaveProperty("metrics");
    }
    expect((await request(app).get("/api/dashboard/requester")).status).toBe(401);
  });
});
