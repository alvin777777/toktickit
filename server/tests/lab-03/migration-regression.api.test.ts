import { describe, it, expect } from "vitest";
import request from "supertest";
import { execFileSync } from "node:child_process";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/password.js";
import { SEEDED, loginAs } from "../helpers/auth.js";

// MIG-01 (AC-31, BR-46, BR-47) — the Lab 2 data survived the Lab 3 migrations intact.
describe("Lab 2 → Lab 3 migration", () => {
  it("keeps every Ticket pointing at a REQUESTER user and every Attachment attached", async () => {
    const prisma = getPrisma();
    const tickets = await prisma.ticket.findMany({ include: { requester: true, attachments: true } });
    for (const ticket of tickets) {
      expect(ticket.requester).not.toBeNull();
      expect(ticket.requester.role).toBe("REQUESTER");
      for (const attachment of ticket.attachments) expect(attachment.ticketId).toBe(ticket.id);
    }
    // Also prove no attachment lost its ticket (the FK forbids it, but say so explicitly).
    const [{ orphaned }] = await prisma.$queryRaw<{ orphaned: bigint }[]>`
      SELECT COUNT(*)::bigint AS orphaned FROM "Attachment" a LEFT JOIN "Ticket" t ON t.id = a."ticketId" WHERE t.id IS NULL`;
    expect(Number(orphaned)).toBe(0);
  });

  it("preserves the Lab 2 inactive requester as inactive and the Lab 2 requesters' ids", async () => {
    const prisma = getPrisma();
    const former = await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.inactiveRequester } });
    expect(former.isActive).toBe(false);
    expect(former.role).toBe("REQUESTER");
    const jennifer = await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.requesterA } });
    expect(jennifer.id).toBe(1); // Lab 2 seeded her first; the in-place rename kept the id
  });

  // MIG-02 (AC-31, BR-46) — a migrated requester logs in with the documented initial password and
  // is forced to change it. Simulated with a row in exactly the state the migration leaves behind.
  it("lets a migrated requester sign in with Welcome123! and then forces a password change", async () => {
    const email = `migrated.${Date.now()}@toktickit.dev`;
    await getPrisma().user.create({
      data: {
        name: "Migrated Requester",
        email,
        role: "REQUESTER",
        mustChangePassword: true,
        // Same precomputed hash the migration writes (prisma/migrations/20261003100000_lab3_users_sessions).
        passwordHash:
          "scrypt$16384$8$1$VG9rVGlja0lUTGFiM01pZw==$XPw4ksT2KxfbrLz2BSi7sKPj751q+TqR+VSuwJYicsmYtdR9+tCl6jLAnC75wcVFLqYcFTTbPiuy9pfcTo2oYA==",
      },
    });
    const cookie = await loginAs(email, "Welcome123!");
    const blocked = await request(app).get("/api/tickets").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

// MIG-03 (FR-08) — the Lab 2 testing mechanism is really gone.
describe("Development Requester mechanism removed", () => {
  it("GET /api/requesters is 404 and X-Requester-Id alone is 401", async () => {
    expect((await request(app).get("/api/requesters")).status).toBe(404);
    expect((await request(app).get("/api/tickets").set("X-Requester-Id", "1")).status).toBe(401);
  });
});

// MIG-04 (§7 seed) — the seed is idempotent.
describe("seed idempotency", () => {
  it("running the seed twice leaves the same users with no duplicates", async () => {
    const prisma = getPrisma();
    const run = () => execFileSync("npx", ["tsx", "prisma/seed.ts"], { cwd: process.cwd(), stdio: "pipe", env: process.env });
    run();
    const before = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
    run();
    const after = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
    expect(after).toEqual(before);
    const emails = await prisma.user.findMany({ select: { email: true } });
    expect(new Set(emails.map((e) => e.email)).size).toBe(emails.length);

    const roles = Object.fromEntries(after.map((r) => [r.role, r._count._all]));
    expect(roles.REQUESTER).toBeGreaterThanOrEqual(5); // 4 active + 1 inactive (+ first-login + test rows)
    expect(roles.IT_STAFF).toBeGreaterThanOrEqual(4); // 3 active + 1 inactive
    expect(roles.ADMIN).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("seeded accounts have hashed passwords, never plaintext", async () => {
    const users = await getPrisma().user.findMany({ select: { passwordHash: true } });
    for (const u of users) expect(u.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(await hashPassword("x")).not.toContain("x$"); // sanity: hash output is not the input
  });
});
