import { expect } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { api } from "./auth.js";

// Lab 4 test helpers (docs/lab-04/tests.md §1): every test makes its own Ticket so files running in
// parallel never share state.
let lookups: { categoryId: number; relatedSystemId: number } | null = null;
async function lookupIds() {
  if (!lookups) {
    const prisma = getPrisma();
    lookups = {
      categoryId: (await prisma.category.findFirstOrThrow()).id,
      relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id,
    };
  }
  return lookups;
}

export async function newTicket(requesterCookie: string, summary: string, requestedPriority = "MEDIUM"): Promise<string> {
  const { categoryId, relatedSystemId } = await lookupIds();
  const res = await api()
    .post("/api/tickets")
    .set("Cookie", requesterCookie)
    .field("categoryId", String(categoryId))
    .field("relatedSystemId", String(relatedSystemId))
    .field("summary", summary)
    .field("description", "Description long enough to pass validation checks.")
    .field("requestedPriority", requestedPriority);
  expect(res.status).toBe(201);
  return res.body.ticketNumber as string;
}

export function ticketByNumber(ticketNumber: string) {
  return getPrisma().ticket.findUniqueOrThrow({ where: { ticketNumber } });
}

// Puts a Ticket straight into a state, bypassing the workflow — only for arranging a test.
export async function forceTicket(ticketNumber: string, data: { currentStatus?: TicketStatus; ownerId?: number | null }) {
  return getPrisma().ticket.update({ where: { ticketNumber }, data });
}

export function userId(email: string) {
  return getPrisma().user.findUniqueOrThrow({ where: { email } }).then((u) => u.id);
}

export const validAction = (overrides: Record<string, unknown> = {}) => ({
  actionAt: new Date().toISOString(),
  description: "Checked the device remotely.",
  result: "Device responds normally.",
  status: "COMPLETED",
  ...overrides,
});

export function postAction(cookie: string, ticketNumber: string, body: Record<string, unknown>) {
  return api().post(`/api/staff/tickets/${ticketNumber}/actions`).set("Cookie", cookie).send(body);
}

export function patchAction(cookie: string, ticketNumber: string, actionId: number, body: Record<string, unknown>) {
  return api().patch(`/api/staff/tickets/${ticketNumber}/actions/${actionId}`).set("Cookie", cookie).send(body);
}

// Lab 4 BR-20 — a Ticket can only be resolved once completed work is recorded. Lab 3 tests that
// resolve a Ticket call this first (BR-38 regression amendment).
export async function recordCompletedAction(cookie: string, ticketNumber: string) {
  const res = await postAction(cookie, ticketNumber, validAction({ description: "Fixed the reported problem." }));
  expect(res.status).toBe(201);
  return res.body;
}

// A brand-new active account (password already changed) so a dashboard test owns all of its data
// and can compare numbers exactly while other files create tickets in parallel.
let hashed: Promise<string> | null = null;
export async function freshUser(role: "REQUESTER" | "IT_STAFF" | "ADMIN") {
  const { hashPassword } = await import("../../src/services/password.js");
  const { loginAs, SEED_PASSWORD } = await import("./auth.js");
  hashed ??= hashPassword(SEED_PASSWORD);
  const email = `lab4.${role.toLowerCase()}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}@toktickit.dev`;
  const user = await getPrisma().user.create({
    data: { name: `Lab4 ${role}`, email, role, passwordHash: await hashed, mustChangePassword: false },
  });
  return { id: user.id, email, cookie: await loginAs(email) };
}

// For numbers that span every Ticket: other test files change them concurrently, so the three
// readings (dashboard, direct count, drill-down list) are retried until one quiet moment agrees.
// A short back-off lets the parallel files' bursts of ticket creation pass; every reading must
// still be exactly equal, so this never accepts a wrong number — it only waits for a quiet moment.
export async function eventuallyEqual(read: () => Promise<number[]>, attempts = 40) {
  let last: number[] = [];
  for (let i = 0; i < attempts; i++) {
    last = await read();
    if (last.every((n) => n === last[0])) return last[0];
    await new Promise((r) => setTimeout(r, 50 + i * 25));
  }
  expect(last, "dashboard / database / drill-down never agreed").toEqual(last.map(() => last[0]));
  return last[0];
}
