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
