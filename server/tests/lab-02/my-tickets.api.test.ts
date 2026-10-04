import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { api, asRequester, asRequesterB } from "../helpers/auth.js";

// Lab 3: the Requester identity now comes from the session cookie (BR-13), not a header.
let requesterA: string;
let requesterB: string;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(cookie: string, summary: string, priority = "MEDIUM") {
  const res = await api()
    .post("/api/tickets")
    .set("Cookie", cookie)
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", priority);
  return res.body;
}

beforeAll(async () => {
  const prisma = getPrisma();
  requesterA = await asRequester();
  requesterB = await asRequesterB();
  const category = await prisma.category.findFirstOrThrow();
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

describe("GET /api/tickets", () => {
  it("only returns the current requester's own tickets (AC-03, BR-11)", async () => {
    await createTicket(requesterA, "My Tickets isolation test A");
    await createTicket(requesterB, "My Tickets isolation test B");

    const resA = await api().get("/api/tickets").set("Cookie", requesterA);
    expect(resA.status).toBe(200);
    const summariesA: string[] = resA.body.items.map((t: { summary: string }) => t.summary);
    expect(summariesA).toContain("My Tickets isolation test A");
    expect(summariesA).not.toContain("My Tickets isolation test B");
  });

  it("supports search and pagination metadata (AC-11, AC-12)", async () => {
    const unique = `Findme-${Date.now()}`;
    await createTicket(requesterA, `${unique} first`);
    await createTicket(requesterA, `${unique} second`);
    await createTicket(requesterA, "unrelated ticket, should not match search");

    const res = await api()
      .get("/api/tickets")
      .query({ search: unique, page: 1, pageSize: 1 })
      .set("Cookie", requesterA);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1); // pageSize=1
    expect(res.body.totalItems).toBe(2); // both "unique" tickets match, page just limits display
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(1);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.items[0].summary).toContain(unique);
  });

  it("falls back to defaults for invalid page/pageSize (BR-13)", async () => {
    const res = await api()
      .get("/api/tickets")
      .query({ page: "not-a-number", pageSize: "-5" })
      .set("Cookie", requesterA);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  // Requested by review on PR #26 — parseInt("2abc") used to silently become 2.
  it("falls back to defaults for partially-numeric page/pageSize (BR-13)", async () => {
    const res = await api()
      .get("/api/tickets")
      .query({ page: "2abc", pageSize: "10px" })
      .set("Cookie", requesterA);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  it("requires an authenticated session (401) and ignores a stray X-Requester-Id (BR-13)", async () => {
    const res = await api().get("/api/tickets").set("X-Requester-Id", "1");
    expect(res.status).toBe(401);
  });
});
