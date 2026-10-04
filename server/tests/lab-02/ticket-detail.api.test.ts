import { describe, it, expect, beforeAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { api, asRequester, asRequesterB } from "../helpers/auth.js";

// Lab 3: the Requester identity now comes from the session cookie (BR-13), not a header.
let requesterA: string;
let requesterB: string;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(cookie: string, summary: string) {
  const res = await api()
    .post("/api/tickets")
    .set("Cookie", cookie)
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", "MEDIUM");
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

describe("GET /api/tickets/:ticketNumber", () => {
  it("returns the owned ticket with fields matching what was stored (AC-13)", async () => {
    const created = await createTicket(requesterA, "Ticket detail happy path");

    const res = await api()
      .get(`/api/tickets/${created.ticketNumber}`)
      .set("Cookie", requesterA);

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe(created.ticketNumber);
    expect(res.body.summary).toBe("Ticket detail happy path");
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.attachments).toEqual([]);
  });

  it("returns 404 for a ticket that isn't owned by the current requester (AC-03, BR-22)", async () => {
    const created = await createTicket(requesterA, "Owned by A only");

    const res = await api()
      .get(`/api/tickets/${created.ticketNumber}`)
      .set("Cookie", requesterB);

    expect(res.status).toBe(404);
  });

  it("returns the identical 404 for a ticket number that doesn't exist at all (BR-22)", async () => {
    const res = await api()
      .get("/api/tickets/TKT-1999-999999")
      .set("Cookie", requesterA);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Ticket not found");
  });
});
