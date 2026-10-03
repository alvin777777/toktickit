import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { asRequester } from "../helpers/auth.js";

// API-11 (Lab 2) — replaced for Lab 3 (docs/lab-03/tests.md §3 / MIG-03, FR-08): the Development
// Requester endpoint no longer exists, authenticated or not.
describe("GET /api/requesters (removed in Lab 3)", () => {
  it("is gone for anonymous callers", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(404);
  });

  it("is gone for authenticated callers too", async () => {
    const cookie = await asRequester();
    const res = await request(app).get("/api/requesters").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});
