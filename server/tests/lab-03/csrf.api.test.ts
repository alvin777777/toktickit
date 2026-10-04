import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN, SEED_PASSWORD, SEEDED, asRequester } from "../helpers/auth.js";

// SEC-09 (AC-34, BR-09a) — forged / missing Origin on unsafe methods is rejected before anything
// else happens, with a valid session cookie attached. Requested by review on PR #39/#40.
let cookie: string;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  cookie = await asRequester();
  const prisma = getPrisma();
  categoryId = (await prisma.category.findFirstOrThrow()).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
});

const FORGED = "http://evil.example";

function createTicket(headers: Record<string, string>) {
  let req = request(app).post("/api/tickets").set("Cookie", cookie);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return req
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", "CSRF forged ticket attempt")
    .field("description", "This ticket must never be created by a forged request.")
    .field("requestedPriority", "LOW");
}

describe("CSRF origin check", () => {
  it.each([
    ["forged Origin", { Origin: FORGED }],
    ["foreign Referer and no Origin", { Referer: `${FORGED}/attack.html` }],
    ["no Origin and no Referer", {}],
  ])("rejects a multipart ticket creation with %s (403, nothing stored)", async (_label, headers) => {
    const before = await getPrisma().ticket.count({ where: { summary: "CSRF forged ticket attempt" } });
    const res = await createTicket(headers);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
    expect(await getPrisma().ticket.count({ where: { summary: "CSRF forged ticket attempt" } })).toBe(before);
  });

  it("rejects a forged logout so a victim's session cannot be killed cross-site", async () => {
    const res = await request(app).post("/api/auth/logout").set("Cookie", cookie).set("Origin", FORGED);
    expect(res.status).toBe(403);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200); // session still alive
  });

  it("rejects a forged login (login CSRF) and a forged password change", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .set("Origin", FORGED)
      .send({ email: SEEDED.requesterB, password: SEED_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.headers["set-cookie"]).toBeUndefined();

    const change = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .set("Referer", `${FORGED}/`)
      .send({ currentPassword: SEED_PASSWORD, newPassword: "Hijacked123", confirmPassword: "Hijacked123" });
    expect(change.status).toBe(403);
    const stillWorks = await request(app).post("/api/auth/login").set("Origin", CLIENT_ORIGIN).send({ email: SEEDED.requesterA, password: SEED_PASSWORD });
    expect(stillWorks.status).toBe(200);
  });

  it("accepts the configured Origin, accepts a matching Referer when Origin is absent, and ignores GETs", async () => {
    const viaOrigin = await request(app).post("/api/auth/logout").set("Origin", CLIENT_ORIGIN);
    expect(viaOrigin.status).toBe(204);
    const viaReferer = await request(app).post("/api/auth/logout").set("Referer", `${CLIENT_ORIGIN}/tickets`);
    expect(viaReferer.status).toBe(204);
    const get = await request(app).get("/api/tickets").set("Cookie", cookie); // no Origin at all
    expect(get.status).toBe(200);
  });
});
