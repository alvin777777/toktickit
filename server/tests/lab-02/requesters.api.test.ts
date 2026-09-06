import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

// API-11 — GET /api/requesters returns only isActive=true requesters (BR-09).
// Requires the DB to be migrated and seeded first (see prisma/seed.ts).
describe("GET /api/requesters", () => {
  it("returns only active development requesters", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    const names: string[] = res.body.map((r: { name: string }) => r.name);
    expect(names).not.toContain("Former Employee"); // seeded as inactive

    for (const requester of res.body) {
      expect(requester).toHaveProperty("id");
      expect(requester).toHaveProperty("name");
      expect(requester).toHaveProperty("email");
    }
  });
});
