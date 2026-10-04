import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/services/password.js";
import { api, SEEDED, loginAs } from "../helpers/auth.js";

// MIG-01 (AC-31, BR-46, BR-46a, BR-47) — builds a *Lab 2* database from the three Lab 2 migrations,
// inserts Lab 2 fixtures, then applies the real Lab 3 migration SQL files to it and inspects the
// result. Requested by review on PR #40: the previous version only looked at whatever database the
// tests were connected to, which could not fail if the migration itself were wrong.

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");
const SCRATCH_DB = "toktickit_migtest";

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d{14}_/.test(d))
    .sort()
    .map((d) => ({ name: d, sql: readFileSync(path.join(MIGRATIONS_DIR, d, "migration.sql"), "utf8") }));
}

// Prisma's raw API runs one statement per call; the migration files are plain, one-statement-
// per-semicolon SQL (comments contain no semicolons), so a split on ";" is faithful.
function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s.length > 0);
}

async function runSql(client: PrismaClient, sql: string) {
  for (const stmt of statements(sql)) await client.$executeRawUnsafe(stmt);
}

let scratch: PrismaClient;

beforeAll(async () => {
  const main = getPrisma();
  await main.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`);
  await main.$executeRawUnsafe(`CREATE DATABASE ${SCRATCH_DB}`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${SCRATCH_DB}`;
  scratch = new PrismaClient({ datasources: { db: { url: url.toString() } } });
}, 60_000);

afterAll(async () => {
  await scratch?.$disconnect();
  await getPrisma().$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`).catch(() => {});
});

describe("Lab 2 → Lab 3 migration (applied to a real Lab 2 schema)", () => {
  it("renames RequesterUser in place, keeps every Ticket/Attachment, back-fills, and leaves migrated accounts unprovisioned", async () => {
    const all = migrationFiles();
    const lab2 = all.filter((m) => m.name < "20261003");
    const lab3 = all.filter((m) => m.name >= "20261003");
    expect(lab2.map((m) => m.name)).toEqual([
      "20260819133454_init",
      "20260906100254_add_requester_user",
      "20260906104123_add_ticket_attachment_relatedsystem",
    ]);
    expect(lab3.length).toBeGreaterThanOrEqual(1);

    // 1. Lab 2 schema + fixtures
    for (const m of lab2) await runSql(scratch, m.sql);
    await scratch.$executeRawUnsafe(`INSERT INTO "Category" (name) VALUES ('Hardware'), ('Software')`);
    await scratch.$executeRawUnsafe(`INSERT INTO "RelatedSystem" (name) VALUES ('Email')`);
    await scratch.$executeRawUnsafe(
      `INSERT INTO "RequesterUser" (name, email, "isActive", "createdAt") VALUES
       ('Lab Two Active', 'lab2.active@toktickit.dev', true, '2026-09-06T10:00:00Z'),
       ('Lab Two Former', 'lab2.former@toktickit.dev', false, '2026-09-06T10:05:00Z')`
    );
    await scratch.$executeRawUnsafe(
      `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "categoryId", "relatedSystemId", summary, description, "requestedPriority", "currentStatus", "updatedAt") VALUES
       ('TKT-2026-000001', 1, 1, 1, 'Lab 2 ticket one', 'desc one long enough', 'HIGH', 'NEW', now()),
       ('TKT-2026-000002', 2, 2, 1, 'Lab 2 ticket two', 'desc two long enough', 'LOW', 'NEW', now())`
    );
    await scratch.$executeRawUnsafe(
      `INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes") VALUES
       (1, 'a.png', 'uuid-a.png', 'image/png', 10), (2, 'b.pdf', 'uuid-b.pdf', 'application/pdf', 20)`
    );

    // 2. The real Lab 3 migrations, exactly as checked in
    for (const m of lab3) await runSql(scratch, m.sql);

    // 3. Inspect
    const users = await scratch.$queryRawUnsafe<
      { id: number; email: string; isActive: boolean; role: string; mustChangePassword: boolean; passwordHash: string; updatedAt: Date | null; createdAt: Date }[]
    >(`SELECT id, email, "isActive", role::text AS role, "mustChangePassword", "passwordHash", "updatedAt", "createdAt" FROM "User" ORDER BY id`);
    expect(users.map((u) => [u.id, u.email, u.isActive])).toEqual([
      [1, "lab2.active@toktickit.dev", true],
      [2, "lab2.former@toktickit.dev", false],
    ]);
    for (const u of users) {
      expect(u.role).toBe("REQUESTER");
      expect(u.mustChangePassword).toBe(true);
      expect(u.passwordHash).toMatch(/^unprovisioned\$[0-9a-f-]{36}$/); // BR-46 — not an scrypt hash
      expect(u.updatedAt).not.toBeNull();
      expect(u.updatedAt!.getTime()).toBe(u.createdAt.getTime()); // BR-46a back-fill
    }
    expect(new Set(users.map((u) => u.passwordHash)).size).toBe(users.length); // unique per row

    const noRequesterUser = await scratch.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM information_schema.tables WHERE table_name = 'RequesterUser'`
    );
    expect(Number(noRequesterUser[0].n)).toBe(0);

    const fk = await scratch.$queryRawUnsafe<{ ref: string }[]>(
      `SELECT ccu.table_name AS ref FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_name = 'Ticket_requesterId_fkey'`
    );
    expect(fk[0].ref).toBe("User");

    const tickets = await scratch.$queryRawUnsafe<
      { ticketNumber: string; requesterId: number; currentStatus: string; attachments: bigint }[]
    >(`SELECT t."ticketNumber", t."requesterId", t."currentStatus"::text,
              (SELECT COUNT(*)::bigint FROM "Attachment" a WHERE a."ticketId" = t.id) AS attachments
       FROM "Ticket" t ORDER BY t.id`);
    expect(tickets.map((t) => [t.ticketNumber, t.requesterId, t.currentStatus, Number(t.attachments)])).toEqual([
      ["TKT-2026-000001", 1, "NEW", 1],
      ["TKT-2026-000002", 2, "NEW", 1],
    ]);

    // Workflow columns (BR-47) exist once the Issue 3 migration is part of the checked-in set.
    if (lab3.some((m) => m.name.endsWith("_lab3_ticket_workflow"))) {
      const workflow = await scratch.$queryRawUnsafe<{ requestedPriority: string; itPriority: string; ownerId: number | null }[]>(
        `SELECT "requestedPriority"::text, "itPriority"::text, "ownerId" FROM "Ticket" ORDER BY id`
      );
      for (const t of workflow) {
        expect(t.itPriority).toBe(t.requestedPriority);
        expect(t.ownerId).toBeNull();
      }
      const statuses = await scratch.$queryRawUnsafe<{ v: string }[]>(`SELECT unnest(enum_range(NULL::"TicketStatus"))::text AS v`);
      expect(statuses.map((s) => s.v)).toEqual(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"]);
    }
  }, 60_000);
});

// MIG-02 (AC-31, BR-46) — an unprovisioned account cannot be used by anyone until an Administrator
// provisions it; afterwards the first-login rule applies.
describe("provisioning a migrated account", () => {
  it("refuses every login before provisioning, then forces a password change after", async () => {
    const email = `migrated.${Date.now()}@toktickit.dev`;
    const user = await getPrisma().user.create({
      data: { name: "Migrated Requester", email, role: "REQUESTER", mustChangePassword: true, passwordHash: `unprovisioned$${crypto.randomUUID()}` },
    });
    for (const guess of ["Welcome123!", "Password123!", `unprovisioned$${user.passwordHash.split("$")[1]}`, ""]) {
      const res = await api().post("/api/auth/login").send({ email, password: guess });
      expect([400, 401]).toContain(res.status);
      expect(res.headers["set-cookie"]).toBeUndefined();
    }

    // Provisioning = what the Administrator's "Set Initial Password" does (Issue 5 switches this
    // to the real POST /api/admin/users/:id/initial-password once that route exists).
    await getPrisma().user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("Provision123"), mustChangePassword: true } });

    const cookie = await loginAs(email, "Provision123");
    const blocked = await api().get("/api/tickets").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

// MIG-03 (FR-08) — the Lab 2 testing mechanism is really gone.
describe("Development Requester mechanism removed", () => {
  it("GET /api/requesters is 404 and X-Requester-Id alone is 401", async () => {
    expect((await api().get("/api/requesters")).status).toBe(404);
    expect((await api().get("/api/tickets").set("X-Requester-Id", "1")).status).toBe(401);
  });
});

// MIG-04 (§7 seed) — the seed is idempotent.
describe("seed idempotency", () => {
  it("running the seed twice leaves the same users with no duplicates", async () => {
    const prisma = getPrisma();
    const run = () => execFileSync("npx", ["tsx", "prisma/seed.ts"], { cwd: process.cwd(), stdio: "pipe", env: process.env });
    // Other test files create their own throwaway users concurrently, so compare only the seeded
    // accounts (by email), not the whole table.
    const seededEmails = Object.values(SEEDED).concat(["lisa.martinez@toktickit.dev", "david.lee@toktickit.dev"]);
    const snapshot = () =>
      prisma.user.findMany({
        where: { email: { in: seededEmails } },
        orderBy: { email: "asc" },
        select: { email: true, role: true, isActive: true, mustChangePassword: true },
      });
    run();
    const before = await snapshot();
    run();
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(before.length).toBe(11);
    expect(new Set(before.map((u) => u.email)).size).toBe(11);
    const roles = before.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.role]: (acc[u.role] ?? 0) + 1 }), {});
    expect(roles.REQUESTER).toBe(6); // 4 active + 1 inactive + 1 first-login
    expect(roles.IT_STAFF).toBe(4); // 3 active + 1 inactive
    expect(roles.ADMIN).toBe(1);
    const tickets = await prisma.ticket.count({ where: { summary: "Grade export produces an empty file" } }); // seed-only summary
    expect(tickets).toBe(1); // seeded tickets are not duplicated either
  }, 60_000);

  it("seeded accounts have hashed passwords, never plaintext", async () => {
    const users = await getPrisma().user.findMany({ select: { passwordHash: true } });
    for (const u of users) expect(u.passwordHash.startsWith("scrypt$") || u.passwordHash.startsWith("unprovisioned$")).toBe(true);
  });
});
