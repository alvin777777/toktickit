import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { SEED_PASSWORD, SEEDED, cookieFrom } from "../helpers/auth.js";

// API-12 (Lab 2) — replaced for Lab 3 (docs/lab-03/tests.md §3): every Requester-scoped endpoint
// rejects a missing, unknown, expired, or inactive-user session the same way (401), and the old
// X-Requester-Id header is ignored rather than honoured (BR-13).
describe("Session enforcement on Requester-scoped endpoints", () => {
  it("rejects a request with no session cookie", async () => {
    const res = await request(app).post("/api/tickets").field("summary", "x");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an unknown session token", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", "toktickit_session=not-a-real-token")
      .field("summary", "x");
    expect(res.status).toBe(401);
  });

  it("ignores X-Requester-Id entirely (401, not the header's identity)", async () => {
    const res = await request(app).get("/api/tickets").set("X-Requester-Id", "1");
    expect(res.status).toBe(401);
  });

  it("rejects a session whose user has been deactivated", async () => {
    // The inactive seeded requester cannot even log in (BR-02), so no session can exist for them.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: SEEDED.inactiveRequester, password: SEED_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.headers["set-cookie"]).toBeUndefined();
  });

  it("accepts a valid session and scopes the request to that user", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: SEEDED.requesterA, password: SEED_PASSWORD });
    const res = await request(app).get("/api/tickets").set("Cookie", cookieFrom(login));
    expect(res.status).toBe(200);
  });
});
