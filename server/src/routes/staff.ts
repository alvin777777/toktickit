import { Router, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { asStaff } from "../middleware/auth.js";
import { TICKET_STATUSES, isPriority, isTicketStatus } from "../services/ticketWorkflow.js";

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

export { TICKET_STATUSES };
