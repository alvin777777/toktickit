import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// API-12 — BR-09: any Requester-scoped endpoint rejects a missing/unknown/inactive
// X-Requester-Id the same way (401), consistently.
describe("X-Requester-Id enforcement", () => {
  it("rejects a request with no X-Requester-Id header", async () => {
    const res = await request(app).post("/api/tickets").field("summary", "x");
    expect(res.status).toBe(401);
  });

  it("rejects a request with an unknown requester id", async () => {
    const res = await request(app).post("/api/tickets").set("X-Requester-Id", "999999").field("summary", "x");
    expect(res.status).toBe(401);
  });

  it("rejects a request using an inactive requester's id", async () => {
    const inactive = await getPrisma().requesterUser.findFirstOrThrow({ where: { isActive: false } });
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", String(inactive.id))
      .field("summary", "x");
    expect(res.status).toBe(401);
  });
});
