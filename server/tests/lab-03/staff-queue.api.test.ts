import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { api, SEEDED, asAdmin, asRequester, asStaff } from "../helpers/auth.js";

// Requires the seeded DB (prisma/seed.ts seeds 14 workflow tickets across statuses/owners).
let staff: string;
let staffId: number;

beforeAll(async () => {
  staff = await asStaff();
  staffId = (await getPrisma().user.findUniqueOrThrow({ where: { email: SEEDED.staffA } })).id;
});

type Item = {
  id: number;
  ticketNumber: string;
  summary: string;
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  requester: { id: number; name: string };
  category: { id: number; name: string };
  owner: { id: number; name: string } | null;
  createdAt: string;
};

describe("GET /api/staff/tickets — queue (API-10, AC-13/AC-14, BR-34)", () => {
  it("lists tickets from every requester with the queue fields and counts", async () => {
    const res = await api().get("/api/staff/tickets?pageSize=50").set("Cookie", staff);
    expect(res.status).toBe(200);
    const items: Item[] = res.body.items;
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(new Set(items.map((i) => i.requester.name)).size).toBeGreaterThan(1);
    for (const item of items) {
      expect(item).toMatchObject({
        ticketNumber: expect.stringMatching(/^TKT-\d{4}-\d{6}$/),
        requester: { name: expect.any(String) },
        category: { name: expect.any(String) },
      });
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(item.itPriority);
    }
    expect(res.body.counts).toEqual({
      all: expect.any(Number),
      unassigned: expect.any(Number),
      mine: expect.any(Number),
    });
    expect(res.body.counts.all).toBeGreaterThanOrEqual(res.body.totalItems);
    // Default ordering: newest first.
    const times = items.map((i) => new Date(i.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("searches by requester name, ticket number, and summary (case-insensitive)", async () => {
    const byName = await api().get("/api/staff/tickets?search=sarah%20johnson&pageSize=50").set("Cookie", staff);
    expect(byName.body.items.length).toBeGreaterThan(0);
    for (const item of byName.body.items as Item[]) expect(item.requester.name).toBe("Sarah Johnson");

    const bySummary = await api().get("/api/staff/tickets?search=BATTERY").set("Cookie", staff);
    expect(bySummary.body.items.some((i: Item) => /battery/i.test(i.summary))).toBe(true);

    const number = byName.body.items[0].ticketNumber as string;
    const byNumber = await api().get(`/api/staff/tickets?search=${number}`).set("Cookie", staff);
    expect(byNumber.body.items.map((i: Item) => i.ticketNumber)).toContain(number);
  });

  it("filters by status, IT priority, category, unassigned, and mine", async () => {
    const status = await api().get("/api/staff/tickets?status=IN_PROGRESS&pageSize=50").set("Cookie", staff);
    expect(status.body.items.length).toBeGreaterThan(0);
    for (const i of status.body.items as Item[]) expect(i.currentStatus).toBe("IN_PROGRESS");

    const pri = await api().get("/api/staff/tickets?itPriority=HIGH&pageSize=50").set("Cookie", staff);
    expect(pri.body.items.length).toBeGreaterThan(0);
    for (const i of pri.body.items as Item[]) expect(i.itPriority).toBe("HIGH");

    const categoryId = (await getPrisma().category.findFirstOrThrow({ where: { name: "Hardware" } })).id;
    const cat = await api().get(`/api/staff/tickets?categoryId=${categoryId}&pageSize=50`).set("Cookie", staff);
    for (const i of cat.body.items as Item[]) expect(i.category.id).toBe(categoryId);

    const unassigned = await api().get("/api/staff/tickets?owner=unassigned&pageSize=50").set("Cookie", staff);
    expect(unassigned.body.items.length).toBeGreaterThan(0);
    for (const i of unassigned.body.items as Item[]) expect(i.owner).toBeNull();
    expect(unassigned.body.totalItems).toBe(unassigned.body.counts.unassigned);

    const mine = await api().get("/api/staff/tickets?owner=me&pageSize=50").set("Cookie", staff);
    expect(mine.body.items.length).toBeGreaterThan(0);
    for (const i of mine.body.items as Item[]) expect(i.owner?.id).toBe(staffId);
    expect(mine.body.totalItems).toBe(mine.body.counts.mine);
  });

  it("sorts by IT priority ascending and paginates with correct metadata", async () => {
    const sorted = await api().get("/api/staff/tickets?sortBy=itPriority&sortDir=asc&pageSize=50").set("Cookie", staff);
    const order = ["LOW", "MEDIUM", "HIGH"];
    const ranks = (sorted.body.items as Item[]).map((i) => order.indexOf(i.itPriority));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

    // Other test files create tickets concurrently; sorting by ticket number ascending keeps the
    // first two pages stable (new tickets append at the end) so the no-overlap check cannot race.
    const page1 = await api().get("/api/staff/tickets?sortBy=ticketNumber&sortDir=asc&pageSize=5&page=1").set("Cookie", staff);
    const page2 = await api().get("/api/staff/tickets?sortBy=ticketNumber&sortDir=asc&pageSize=5&page=2").set("Cookie", staff);
    expect(page1.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(page1.body.items).toHaveLength(5);
    expect(page1.body.totalPages).toBe(Math.ceil(page1.body.totalItems / 5));
    const ids1 = page1.body.items.map((i: Item) => i.id);
    const ids2 = page2.body.items.map((i: Item) => i.id);
    expect(ids1.some((id: number) => ids2.includes(id))).toBe(false);
  });

  // API-11 (AC-14, BR-34)
  it("falls back to defaults for invalid query values instead of erroring", async () => {
    const res = await api()
      .get("/api/staff/tickets?page=abc&pageSize=999&status=BOGUS&itPriority=URGENT&sortBy=nope&owner=zzz")
      .set("Cookie", staff);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50); // capped, not rejected
    expect(res.body.totalItems).toBe(res.body.counts.all); // bogus filters ignored
  });

  it("is available to Administrators and refused to Requesters (BR-14/BR-15)", async () => {
    const admin = await api().get("/api/staff/tickets").set("Cookie", await asAdmin());
    expect(admin.status).toBe(200);
    const requester = await api().get("/api/staff/tickets").set("Cookie", await asRequester());
    expect(requester.status).toBe(403);
    expect(requester.body.code).toBe("FORBIDDEN");
    expect(requester.body.items).toBeUndefined();
  });
});

// API-12 (FR-13, BR-23)
describe("GET /api/staff/assignees", () => {
  it("returns only active IT Staff and Administrators", async () => {
    const res = await api().get("/api/staff/assignees").set("Cookie", staff);
    expect(res.status).toBe(200);
    const emails = await getPrisma().user.findMany({ where: { id: { in: res.body.map((u: { id: number }) => u.id) } } });
    for (const u of emails) {
      expect(u.isActive).toBe(true);
      expect(["IT_STAFF", "ADMIN"]).toContain(u.role);
    }
    const names = res.body.map((u: { name: string }) => u.name);
    expect(names).toContain("Emily Davis");
    expect(names).toContain("John Smith");
    expect(names).not.toContain("Robert Wilson"); // inactive IT Staff
    expect(names).not.toContain("Jennifer Anderson"); // requester
    for (const u of res.body) expect(u).not.toHaveProperty("passwordHash");
  });
});
