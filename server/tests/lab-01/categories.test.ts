import { api } from "../helpers/auth.js";
import { describe, it, expect } from "vitest";

// Issue 4 — requires the DB to be migrated and seeded first (see Issue 3).
describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const res = await api().get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);
  });
});
