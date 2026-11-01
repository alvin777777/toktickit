import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { getPrisma } from "../../src/prisma.js";

// MIG-05 (AC-25, BR-36) — builds a *Lab 3* database from the real Lab 1–3 migrations, inserts Lab 3
// fixtures, applies the checked-in Lab 4 migration, then the rollback script, then the migration
// again. Same technique as Lab 3's MIG-01 (review on PR #40): test the real SQL on a real schema.

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");
const ROLLBACK = path.resolve(process.cwd(), "prisma/rollback/20261031100000_lab4_actions_taken.down.sql");
const LAB4 = "20261031100000_lab4_actions_taken";
const SCRATCH_DB = "toktickit_migtest_lab4";

function migrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d{14}_/.test(d))
    .sort()
    .map((d) => ({ name: d, sql: readFileSync(path.join(MIGRATIONS_DIR, d, "migration.sql"), "utf8") }));
}

// One statement per semicolon-terminated line group; comments contain no semicolons.
function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s.length > 0);
}

async function runSql(client: PrismaClient, sql: string) {
  for (const stmt of statements(sql.endsWith("\n") ? sql : `${sql}\n`)) await client.$executeRawUnsafe(stmt);
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

const count = async (sql: string) => Number((await scratch.$queryRawUnsafe<{ n: bigint }[]>(sql))[0].n);
const tableExists = (name: string) => count(`SELECT COUNT(*)::bigint AS n FROM information_schema.tables WHERE table_name = '${name}'`);
const columnExists = (table: string, column: string) =>
  count(`SELECT COUNT(*)::bigint AS n FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`);

describe("Lab 3 → Lab 4 migration (applied to a real Lab 3 schema), rollback, and re-apply", () => {
  it("keeps every Lab 3 row, back-fills BR-36, rolls back cleanly, and re-applies", async () => {
    const all = migrations();
    const before = all.filter((m) => m.name < LAB4);
    const lab4 = all.find((m) => m.name === LAB4)!;
    expect(lab4).toBeDefined();
    expect(before.map((m) => m.name).at(-1)).toBe("20261003120000_lab3_comments_notes");

    // 1. Lab 3 schema + fixtures
    for (const m of before) await runSql(scratch, m.sql);
    await scratch.$executeRawUnsafe(`INSERT INTO "Category" (name) VALUES ('Hardware')`);
    await scratch.$executeRawUnsafe(`INSERT INTO "RelatedSystem" (name) VALUES ('Email')`);
    await scratch.$executeRawUnsafe(
      `INSERT INTO "User" (name, email, "passwordHash", role, "updatedAt") VALUES
       ('Req One', 'req@lab3.dev', 'x', 'REQUESTER', now()), ('Staff One', 'staff@lab3.dev', 'x', 'IT_STAFF', now())`
    );
    await scratch.$executeRawUnsafe(
      `INSERT INTO "Ticket" ("ticketNumber", "requesterId", "ownerId", "categoryId", "relatedSystemId", summary, description, "requestedPriority", "itPriority", "currentStatus", "createdAt", "updatedAt") VALUES
       ('TKT-2026-000001', 1, NULL, 1, 1, 'New one', 'desc long enough', 'LOW', 'LOW', 'NEW', '2026-10-01T08:00:00Z', '2026-10-01T08:00:00Z'),
       ('TKT-2026-000002', 1, 2, 1, 1, 'Resolved one', 'desc long enough', 'HIGH', 'HIGH', 'RESOLVED', '2026-10-02T08:00:00Z', '2026-10-05T09:30:00Z'),
       ('TKT-2026-000003', 1, 2, 1, 1, 'Closed one', 'desc long enough', 'MEDIUM', 'LOW', 'CLOSED', '2026-10-03T08:00:00Z', '2026-10-06T10:00:00Z')`
    );
    await scratch.$executeRawUnsafe(`INSERT INTO "TicketComment" ("ticketId", "authorId", body) VALUES (2, 1, 'Public comment')`);
    await scratch.$executeRawUnsafe(`INSERT INTO "InternalNote" ("ticketId", "authorId", body) VALUES (2, 2, 'Private note')`);
    await scratch.$executeRawUnsafe(
      `INSERT INTO "Attachment" ("ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes") VALUES (3, 'a.png', 'uuid-a.png', 'image/png', 10)`
    );
    const snapshot = () =>
      scratch.$queryRawUnsafe<unknown[]>(
        `SELECT t.id, t."ticketNumber", t."requesterId", t."ownerId", t."currentStatus"::text, t."itPriority"::text, t."updatedAt",
                (SELECT COUNT(*)::int FROM "TicketComment" c WHERE c."ticketId" = t.id) AS comments,
                (SELECT COUNT(*)::int FROM "InternalNote" n WHERE n."ticketId" = t.id) AS notes,
                (SELECT COUNT(*)::int FROM "Attachment" a WHERE a."ticketId" = t.id) AS attachments
         FROM "Ticket" t ORDER BY t.id`
      );
    const lab3Rows = await snapshot();

    // 2. Lab 4 migration, exactly as checked in
    await runSql(scratch, lab4.sql);
    expect(await snapshot()).toEqual(lab3Rows); // nothing lost or altered
    expect(await count(`SELECT COUNT(*)::bigint AS n FROM "ActionTaken"`)).toBe(0); // legacy tickets have no actions
    const tickets = await scratch.$queryRawUnsafe<{ id: number; version: number; resolvedAt: Date | null; updatedAt: Date }[]>(
      `SELECT id, version, "resolvedAt", "updatedAt" FROM "Ticket" ORDER BY id`
    );
    expect(tickets.map((t) => t.version)).toEqual([1, 1, 1]);
    expect(tickets[0].resolvedAt).toBeNull();
    expect(tickets[1].resolvedAt!.getTime()).toBe(tickets[1].updatedAt.getTime());
    expect(tickets[2].resolvedAt!.getTime()).toBe(tickets[2].updatedAt.getTime());
    const history = await scratch.$queryRawUnsafe<{ ticketId: number; fromStatus: string | null; toStatus: string; changedById: number | null }[]>(
      `SELECT "ticketId", "fromStatus"::text, "toStatus"::text, "changedById" FROM "TicketStatusHistory" ORDER BY "ticketId"`
    );
    expect(history).toEqual([
      { ticketId: 1, fromStatus: null, toStatus: "NEW", changedById: null },
      { ticketId: 2, fromStatus: null, toStatus: "RESOLVED", changedById: null },
      { ticketId: 3, fromStatus: null, toStatus: "CLOSED", changedById: null },
    ]);

    // 3. Rollback: Lab 4 objects gone, Lab 3 rows untouched
    await runSql(scratch, readFileSync(ROLLBACK, "utf8"));
    expect(await tableExists("ActionTaken")).toBe(0);
    expect(await tableExists("TicketStatusHistory")).toBe(0);
    expect(await columnExists("Ticket", "version")).toBe(0);
    expect(await columnExists("Ticket", "resolvedAt")).toBe(0);
    expect(await count(`SELECT COUNT(*)::bigint AS n FROM pg_type WHERE typname = 'ActionStatus'`)).toBe(0);
    expect(await snapshot()).toEqual(lab3Rows);

    // 4. Re-apply succeeds on the rolled-back database
    await runSql(scratch, lab4.sql);
    expect(await tableExists("ActionTaken")).toBe(1);
    expect(await count(`SELECT COUNT(*)::bigint AS n FROM "TicketStatusHistory"`)).toBe(3);
  }, 60_000);
});

// MIG-06 (AC-26) — the extended seed is idempotent and gives zero / one / several actions.
describe("Lab 4 seed", () => {
  it("does not duplicate actions or history when run twice", async () => {
    const prisma = getPrisma();
    const run = () => execFileSync("npx", ["tsx", "prisma/seed.ts"], { cwd: process.cwd(), stdio: "pipe", env: process.env });
    const seededTickets = () =>
      prisma.ticket.findMany({
        where: { requester: { email: { endsWith: "@toktickit.dev" } }, summary: { in: ["Laptop battery drains quickly", "Cannot connect to VPN", "Request access to grade submission"] } },
        orderBy: { id: "asc" },
        distinct: ["summary"],
        select: { id: true, summary: true },
      });
    const snapshot = async () => {
      const ids = (await seededTickets()).map((t) => t.id);
      return {
        actions: await prisma.actionTaken.findMany({ where: { ticketId: { in: ids } }, orderBy: { id: "asc" }, select: { id: true, status: true, description: true } }),
        history: await prisma.ticketStatusHistory.count({ where: { ticketId: { in: ids } } }),
      };
    };
    run();
    const first = await snapshot();
    run();
    expect(await snapshot()).toEqual(first);

    const perTicket = await Promise.all(
      (await seededTickets()).map(async (t) => [t.summary, await prisma.actionTaken.count({ where: { ticketId: t.id } })] as const)
    );
    expect(Object.fromEntries(perTicket)).toEqual({
      "Laptop battery drains quickly": 3, // several
      "Cannot connect to VPN": 1, // one
      "Request access to grade submission": 0, // zero
    });
    const statuses = await prisma.actionTaken.groupBy({ by: ["status"], _count: true });
    expect(statuses.map((s) => s.status).sort()).toEqual(["CANCELLED", "COMPLETED", "IN_PROGRESS", "PLANNED"]);
  }, 60_000);
});
