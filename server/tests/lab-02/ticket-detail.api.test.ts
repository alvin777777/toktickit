import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

let requesterA: number;
let requesterB: number;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(requesterId: number, summary: string) {
  const res = await request(app)
    .post("/api/tickets")
    .set("X-Requester-Id", String(requesterId))
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", "MEDIUM");
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

describe("GET /api/tickets/:ticketNumber", () => {
  it("returns the owned ticket with fields matching what was stored (AC-13)", async () => {
    const created = await createTicket(requesterA, "Ticket detail happy path");

    const res = await request(app)
      .get(`/api/tickets/${created.ticketNumber}`)
      .set("X-Requester-Id", String(requesterA));

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe(created.ticketNumber);
    expect(res.body.summary).toBe("Ticket detail happy path");
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.attachments).toEqual([]);
  });

  it("returns 404 for a ticket that isn't owned by the current requester (AC-03, BR-22)", async () => {
    const created = await createTicket(requesterA, "Owned by A only");

    const res = await request(app)
      .get(`/api/tickets/${created.ticketNumber}`)
      .set("X-Requester-Id", String(requesterB));

    expect(res.status).toBe(404);
  });

  it("returns the identical 404 for a ticket number that doesn't exist at all (BR-22)", async () => {
    const res = await request(app)
      .get("/api/tickets/TKT-1999-999999")
      .set("X-Requester-Id", String(requesterA));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Ticket not found");
  });
});
