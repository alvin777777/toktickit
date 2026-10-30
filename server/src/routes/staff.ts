import { Router, Request, Response } from "express";
import type { Prisma, TicketStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { asStaff } from "../middleware/auth.js";
import { TICKET_STATUSES, allowedTransitions, canTransition, isPriority, isTerminal, isTicketStatus } from "../services/ticketWorkflow.js";
import { authorSelect, serializeEntry, serializeStaffTicket, staffDetailInclude, validateEntryBody } from "../services/ticketSerializers.js";
import { staffActionsRouter } from "./actions.js";
import { resolutionBlockers } from "../services/actions.js";
import { HttpError, sendError } from "../services/httpError.js";

// Lab 3 Issue 3 — IT Staff endpoints (docs/lab-03/api-spec.md §4). Every route is guarded by
// asStaff (requireAuth → requirePasswordChanged → requireRole IT_STAFF|ADMIN) before any lookup,
// so a Requester can never learn whether a ticket exists through these paths (BR-18).
export const staffRouter = Router();
staffRouter.use(...asStaff);

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const SORTABLE = new Set(["createdAt", "updatedAt", "itPriority", "currentStatus", "ticketNumber"]);

// Same strictness as Lab 2 (BR-13 there / BR-34 here): "2abc" is not a page number.
function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const queueItemSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.TicketSelect;

// ---------------------------------------------------------------------------
// api-spec.md §4.1 — GET /api/staff/tickets (Ticket Queue)
// ---------------------------------------------------------------------------
staffRouter.get("/tickets", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const me = req.user!.id;

  // BR-34 — invalid values fall back to defaults, never error.
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const sortByParam = String(req.query.sortBy ?? "createdAt");
  const sortBy = SORTABLE.has(sortByParam) ? sortByParam : "createdAt";
  const sortDir: "asc" | "desc" = req.query.sortDir === "asc" ? "asc" : "desc";

  const where: Prisma.TicketWhereInput = {};
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    where.OR = [
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
      { requester: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (isTicketStatus(req.query.status)) where.currentStatus = req.query.status;
  if (isPriority(req.query.itPriority)) where.itPriority = req.query.itPriority;
  const categoryId = Number(req.query.categoryId);
  if (Number.isInteger(categoryId) && categoryId > 0) where.categoryId = categoryId;

  const owner = req.query.owner;
  if (owner === "unassigned") where.ownerId = null;
  else if (owner === "me") where.ownerId = me;
  else if (typeof owner === "string" && Number.isInteger(Number(owner)) && Number(owner) > 0) {
    where.ownerId = Number(owner);
  }

  try {
    const [items, totalItems, all, unassigned, mine] = await Promise.all([
      prisma.ticket.findMany({
        where,
        // Enum columns sort in declaration order in Postgres (LOW < MEDIUM < HIGH; BR-25 order for
        // statuses), which is exactly the ordering api-spec.md §4.1 promises.
        orderBy: [{ [sortBy]: sortDir }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: queueItemSelect,
      }),
      prisma.ticket.count({ where }),
      prisma.ticket.count(),
      prisma.ticket.count({ where: { ownerId: null } }),
      prisma.ticket.count({ where: { ownerId: me } }),
    ]);

    res.status(200).json({
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      counts: { all, unassigned, mine },
    });
  } catch {
    res.status(500).json({ error: "Unable to load the ticket queue" });
  }
});

// ---------------------------------------------------------------------------
// api-spec.md §4.2 — GET /api/staff/assignees (active IT Staff / Administrators, BR-23)
// ---------------------------------------------------------------------------
staffRouter.get("/assignees", async (_req: Request, res: Response) => {
  try {
    const users = await getPrisma().user.findMany({
      where: { isActive: true, role: { in: ["IT_STAFF", "ADMIN"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    res.status(200).json(users);
  } catch {
    res.status(500).json({ error: "Unable to load assignees" });
  }
});

// ---------------------------------------------------------------------------
// Lab 3 Issue 4 — IT Staff Ticket Detail and operations (api-spec.md §4.3–§4.9)
// ---------------------------------------------------------------------------
async function loadTicket(ticketNumber: string) {
  return getPrisma().ticket.findUnique({ where: { ticketNumber }, include: staffDetailInclude });
}

// §4.3
staffRouter.get("/tickets/:ticketNumber", async (req: Request, res: Response) => {
  try {
    const ticket = await loadTicket(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.status(200).json(serializeStaffTicket(ticket));
  } catch {
    res.status(500).json({ error: "Unable to load ticket" });
  }
});

// ---------------------------------------------------------------------------
// Lab 4 Issue 3 — every workflow change (claim, owner, IT Priority, status) runs in one transaction
// that locks the Ticket row first (docs/lab-04/specification.md BR-26), checks the optional
// `expectedVersion` (BR-25), writes, bumps `version`, and appends status history (BR-24). Locking
// replaces Lab 3's conditional updateMany for claim: the second of two racing claims now waits for
// the first and then sees the owner, so it still gets ALREADY_ASSIGNED (L3 AC-35).
// ---------------------------------------------------------------------------
type Tx = Prisma.TransactionClient;

async function lockTicket(tx: Tx, ticketNumber: string) {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Ticket" WHERE "ticketNumber" = ${ticketNumber} FOR UPDATE`;
  if (!rows[0]) throw new HttpError(404, { error: "Ticket not found" });
  return tx.ticket.findUniqueOrThrow({ where: { id: rows[0].id }, include: staffDetailInclude });
}

type LockedTicket = Awaited<ReturnType<typeof lockTicket>>;

function checkVersion(ticket: LockedTicket, expected: unknown) {
  if (expected === undefined || expected === null) return; // optional for Lab 3 clients (BR-25)
  if (!Number.isInteger(expected)) {
    throw new HttpError(400, { error: "Invalid version", fields: { expectedVersion: "Version must be a whole number." } });
  }
  if (ticket.version !== expected) {
    throw new HttpError(409, {
      error: "Someone else updated this ticket. Review the latest values and try again.",
      code: "STALE_UPDATE",
      current: serializeStaffTicket(ticket),
    });
  }
}

const terminalConflict = () => new HttpError(409, { error: "This ticket is closed or cancelled.", code: "TICKET_TERMINAL" });

function recordStatus(tx: Tx, ticketId: number, fromStatus: TicketStatus, toStatus: TicketStatus, changedById: number) {
  return tx.ticketStatusHistory.create({ data: { ticketId, fromStatus, toStatus, changedById } });
}

// Runs `change` against the locked Ticket and answers with the fresh staff Ticket.
async function workflow(req: Request, res: Response, fallback: string, change: (tx: Tx, ticket: LockedTicket) => Promise<void>) {
  try {
    const updated = await getPrisma().$transaction(async (tx) => {
      const ticket = await lockTicket(tx, req.params.ticketNumber);
      checkVersion(ticket, req.body?.expectedVersion);
      await change(tx, ticket);
      return tx.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: staffDetailInclude });
    });
    res.status(200).json(serializeStaffTicket(updated));
  } catch (err) {
    sendError(res, err, fallback);
  }
}

// §4.4 — Claim (L3 BR-26/BR-27/BR-28)
staffRouter.post("/tickets/:ticketNumber/claim", (req: Request, res: Response) =>
  workflow(req, res, "Unable to claim ticket", async (tx, ticket) => {
    if (isTerminal(ticket.currentStatus)) throw terminalConflict();
    if (ticket.ownerId === req.user!.id) return; // already mine — nothing to change
    if (ticket.ownerId) {
      throw new HttpError(409, { error: `This ticket is already owned by ${ticket.owner?.name ?? "another user"}.`, code: "ALREADY_ASSIGNED" });
    }
    const opens = ticket.currentStatus === "NEW";
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { ownerId: req.user!.id, version: { increment: 1 }, ...(opens ? { currentStatus: "OPEN" } : {}) },
    });
    if (opens) await recordStatus(tx, ticket.id, "NEW", "OPEN", req.user!.id);
  })
);

// §4.5 — Assign / reassign / unassign (L3 BR-23/BR-26/BR-28/BR-29)
staffRouter.patch("/tickets/:ticketNumber/owner", (req: Request, res: Response) => {
  const raw = req.body?.ownerId;
  if (raw !== null && !(Number.isInteger(raw) && raw > 0)) {
    return res.status(400).json({ error: "Invalid owner", fields: { ownerId: "Select an active IT Staff or Administrator." } });
  }
  return workflow(req, res, "Unable to update ticket owner", async (tx, ticket) => {
    if (isTerminal(ticket.currentStatus)) throw terminalConflict();
    if (raw === null) {
      if (ticket.currentStatus === "RESOLVED") {
        throw new HttpError(409, { error: "A resolved ticket must keep its owner.", code: "OWNER_REQUIRED" });
      }
    } else {
      const assignee = await tx.user.findUnique({ where: { id: raw } });
      if (!assignee || !assignee.isActive || assignee.role === "REQUESTER") {
        throw new HttpError(400, { error: "Invalid owner", fields: { ownerId: "Select an active IT Staff or Administrator." } });
      }
    }
    const opens = raw !== null && ticket.currentStatus === "NEW";
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { ownerId: raw, version: { increment: 1 }, ...(opens ? { currentStatus: "OPEN" } : {}) },
    });
    if (opens) await recordStatus(tx, ticket.id, "NEW", "OPEN", req.user!.id);
  });
});

// §4.6 — IT Priority (L3 BR-24/BR-28)
staffRouter.patch("/tickets/:ticketNumber/it-priority", (req: Request, res: Response) => {
  const itPriority = req.body?.itPriority;
  if (!isPriority(itPriority)) {
    return res.status(400).json({ error: "Invalid IT priority", fields: { itPriority: "IT priority must be LOW, MEDIUM, or HIGH." } });
  }
  return workflow(req, res, "Unable to update IT priority", async (tx, ticket) => {
    if (isTerminal(ticket.currentStatus)) throw terminalConflict();
    await tx.ticket.update({ where: { id: ticket.id }, data: { itPriority, version: { increment: 1 } } });
  });
});

// §4.7 — Status transition: Lab 4 api-spec.md §2.3 (BR-18, BR-20, BR-23, BR-11, BR-24)
staffRouter.patch("/tickets/:ticketNumber/status", (req: Request, res: Response) => {
  const status = req.body?.status;
  if (!isTicketStatus(status)) return res.status(400).json({ error: "Invalid status", fields: { status: "Unknown status." } });
  return workflow(req, res, "Unable to update status", async (tx, ticket) => {
    if (!canTransition(ticket.currentStatus, status)) {
      throw new HttpError(409, {
        error: `Cannot move from ${ticket.currentStatus} to ${status}.`,
        code: "INVALID_TRANSITION",
        allowed: allowedTransitions(ticket.currentStatus),
      });
    }
    if (status === "RESOLVED") {
      if (!ticket.ownerId) throw new HttpError(409, { error: "Assign a ticket owner before resolving.", code: "OWNER_REQUIRED" });
      // BR-20 — evaluated on the locked row, so an action opened concurrently cannot slip past.
      const blockers = resolutionBlockers(ticket, ticket.actions).filter((b) => b !== "OWNER_REQUIRED");
      if (blockers.length > 0) {
        throw new HttpError(409, { error: "This ticket cannot be resolved yet.", code: "RESOLUTION_BLOCKED", blockers });
      }
    }
    const now = new Date();
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        currentStatus: status,
        version: { increment: 1 },
        ...(status === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(status === "REOPENED" ? { resolvedAt: null } : {}), // BR-23
      },
    });
    if (status === "CANCELLED") {
      // BR-11 — no open work is left on a cancelled Ticket.
      await tx.actionTaken.updateMany({
        where: { ticketId: ticket.id, status: { in: ["PLANNED", "IN_PROGRESS"] } },
        data: { status: "CANCELLED", cancelledAt: now, version: { increment: 1 } },
      });
    }
    await recordStatus(tx, ticket.id, ticket.currentStatus, status, req.user!.id);
  });
});

// §4.8 / §4.9 — Internal Notes (BR-35..BR-38). The asStaff guard on this router already rejected
// Requesters (403) before we get here, so no note content or ticket existence leaks (BR-18).
staffRouter.get("/tickets/:ticketNumber/internal-notes", async (req: Request, res: Response) => {
  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { ticketNumber: req.params.ticketNumber }, select: { id: true } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const notes = await getPrisma().internalNote.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "asc" },
      include: { author: authorSelect },
    });
    res.status(200).json(notes.map(serializeEntry));
  } catch {
    res.status(500).json({ error: "Unable to load internal notes" });
  }
});

staffRouter.post("/tickets/:ticketNumber/internal-notes", async (req: Request, res: Response) => {
  const { body, error } = validateEntryBody(req.body?.body);
  if (error) return res.status(400).json({ error: "Invalid note", fields: { body: "Note must be 1-2000 characters." } });
  try {
    const ticket = await getPrisma().ticket.findUnique({ where: { ticketNumber: req.params.ticketNumber }, select: { id: true } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const note = await getPrisma().internalNote.create({
      data: { ticketId: ticket.id, authorId: req.user!.id, body: body! },
      include: { author: authorSelect },
    });
    res.status(201).json(serializeEntry(note));
  } catch {
    res.status(500).json({ error: "Unable to add internal note" });
  }
});

// Lab 4 Issue 2 — Actions Taken (docs/lab-04/api-spec.md §1.1–§1.3), behind the same asStaff guard.
staffRouter.use("/tickets/:ticketNumber/actions", staffActionsRouter);

export { TICKET_STATUSES };
