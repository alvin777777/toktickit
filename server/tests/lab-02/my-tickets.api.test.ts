import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

let requesterA: number;
let requesterB: number;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(requesterId: number, summary: string, priority = "MEDIUM") {
  const res = await request(app)
    .post("/api/tickets")
    .set("X-Requester-Id", String(requesterId))
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", priority);
  return res.body;
}

beforeAll(async () => {
  const prisma = getPrisma();
  const [reqA, reqB] = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    take: 2,
  });
  requesterA = reqA.id;
  requesterB = reqB.id;
  const category = await prisma.category.findFirstOrThrow();
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

describe("GET /api/tickets", () => {
  it("only returns the current requester's own tickets (AC-03, BR-11)", async () => {
    await createTicket(requesterA, "My Tickets isolation test A");
    await createTicket(requesterB, "My Tickets isolation test B");

    const resA = await request(app).get("/api/tickets").set("X-Requester-Id", String(requesterA));
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

    const res = await request(app)
      .get("/api/tickets")
      .query({ search: unique, page: 1, pageSize: 1 })
      .set("X-Requester-Id", String(requesterA));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1); // pageSize=1
    expect(res.body.totalItems).toBe(2); // both "unique" tickets match, page just limits display
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(1);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.items[0].summary).toContain(unique);
  });

  it("falls back to defaults for invalid page/pageSize (BR-13)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .query({ page: "not-a-number", pageSize: "-5" })
      .set("X-Requester-Id", String(requesterA));

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  it("requires a valid X-Requester-Id (401)", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(401);
  });
});
