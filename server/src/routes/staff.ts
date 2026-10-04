import { Router, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { asStaff } from "../middleware/auth.js";
import { TICKET_STATUSES, allowedTransitions, canTransition, isPriority, isTerminal, isTicketStatus } from "../services/ticketWorkflow.js";
import { authorSelect, serializeEntry, serializeStaffTicket, staffDetailInclude, validateEntryBody } from "../services/ticketSerializers.js";

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

function terminalConflict(res: Response) {
  return res.status(409).json({ error: "This ticket is closed or cancelled.", code: "TICKET_TERMINAL" });
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

// §4.4 — Claim (BR-26/BR-27/BR-28)
staffRouter.post("/tickets/:ticketNumber/claim", async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const ticket = await loadTicket(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (isTerminal(ticket.currentStatus)) return terminalConflict(res);
    // BR-27 / AC-35 — first claim wins. The ownership test and the write are one conditional
    // UPDATE (ownerId IS NULL, or already mine), so two simultaneous claims cannot both succeed
    // (review on PR #42).
    const claimed = await prisma.ticket.updateMany({
      where: { id: ticket.id, OR: [{ ownerId: null }, { ownerId: req.user!.id }], currentStatus: { notIn: ["CLOSED", "CANCELLED"] } },
      data: { ownerId: req.user!.id, ...(ticket.currentStatus === "NEW" ? { currentStatus: "OPEN" } : {}) },
    });
    if (claimed.count === 0) {
      const current = await loadTicket(req.params.ticketNumber);
      if (current && isTerminal(current.currentStatus)) return terminalConflict(res);
      return res.status(409).json({
        error: `This ticket is already owned by ${current?.owner?.name ?? "another user"}.`,
        code: "ALREADY_ASSIGNED",
      });
    }
    const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: staffDetailInclude });
    res.status(200).json(serializeStaffTicket(updated));
  } catch {
    res.status(500).json({ error: "Unable to claim ticket" });
  }
});

// §4.5 — Assign / reassign / unassign (BR-23/BR-26/BR-28/BR-29)
staffRouter.patch("/tickets/:ticketNumber/owner", async (req: Request, res: Response) => {
  const raw = req.body?.ownerId;
  if (raw !== null && !(Number.isInteger(raw) && raw > 0)) {
    return res.status(400).json({ error: "Invalid owner", fields: { ownerId: "Select an active IT Staff or Administrator." } });
  }
  try {
    const prisma = getPrisma();
    const ticket = await loadTicket(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (isTerminal(ticket.currentStatus)) return terminalConflict(res);

    if (raw === null) {
      if (ticket.currentStatus === "RESOLVED") {
        return res.status(409).json({ error: "A resolved ticket must keep its owner.", code: "OWNER_REQUIRED" });
      }
    } else {
      const assignee = await prisma.user.findUnique({ where: { id: raw } });
      if (!assignee || !assignee.isActive || assignee.role === "REQUESTER") {
        return res.status(400).json({ error: "Invalid owner", fields: { ownerId: "Select an active IT Staff or Administrator." } });
      }
    }
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { ownerId: raw, ...(raw !== null && ticket.currentStatus === "NEW" ? { currentStatus: "OPEN" } : {}) },
      include: staffDetailInclude,
    });
    res.status(200).json(serializeStaffTicket(updated));
  } catch {
    res.status(500).json({ error: "Unable to update ticket owner" });
  }
});

// §4.6 — IT Priority (BR-24/BR-28)
staffRouter.patch("/tickets/:ticketNumber/it-priority", async (req: Request, res: Response) => {
  const itPriority = req.body?.itPriority;
  if (!isPriority(itPriority)) {
    return res.status(400).json({ error: "Invalid IT priority", fields: { itPriority: "IT priority must be LOW, MEDIUM, or HIGH." } });
  }
  try {
    const ticket = await loadTicket(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (isTerminal(ticket.currentStatus)) return terminalConflict(res);
    const updated = await getPrisma().ticket.update({ where: { id: ticket.id }, data: { itPriority }, include: staffDetailInclude });
    res.status(200).json(serializeStaffTicket(updated));
  } catch {
    res.status(500).json({ error: "Unable to update IT priority" });
  }
});

// §4.7 — Status transition (BR-29/BR-30)
staffRouter.patch("/tickets/:ticketNumber/status", async (req: Request, res: Response) => {
  const status = req.body?.status;
  if (!isTicketStatus(status)) return res.status(400).json({ error: "Invalid status", fields: { status: "Unknown status." } });
  try {
    const ticket = await loadTicket(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (!canTransition(ticket.currentStatus, status)) {
      return res.status(409).json({
        error: `Cannot move from ${ticket.currentStatus} to ${status}.`,
        code: "INVALID_TRANSITION",
        allowed: allowedTransitions(ticket.currentStatus),
      });
    }
    if (status === "RESOLVED" && !ticket.ownerId) {
      return res.status(409).json({ error: "Assign a ticket owner before resolving.", code: "OWNER_REQUIRED" });
    }
    const updated = await getPrisma().ticket.update({ where: { id: ticket.id }, data: { currentStatus: status }, include: staffDetailInclude });
    res.status(200).json(serializeStaffTicket(updated));
  } catch {
    res.status(500).json({ error: "Unable to update status" });
  }
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

export { TICKET_STATUSES };
