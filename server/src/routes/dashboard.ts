import { Router, Request, Response } from "express";
import type { Prisma, TicketStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { asRequester, asStaff } from "../middleware/auth.js";
import { WORKABLE_STATUSES } from "../services/actions.js";
import { PRIORITIES, TICKET_STATUSES } from "../services/ticketWorkflow.js";

// Lab 4 Issue 5 — role dashboards (docs/lab-04/specification.md BR-27..BR-34, api-spec.md §3).
// Every number is a COUNT / GROUP BY on the authoritative tables, computed live, and every query of
// one response runs in a single REPEATABLE READ snapshot so the cards agree with each other and with
// the drill-down list they link to (BR-34). Lists are capped at 5 rows (BR-27).
export const dashboardRouter = Router();

const LIST_SIZE = 5;
const RECENT_WINDOW_DAYS = 7;
const ACTIVE = { in: WORKABLE_STATUSES };
const snapshot = { isolationLevel: "RepeatableRead" } as const;

const summarySelect = {
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  itPriority: true,
  updatedAt: true,
  resolvedAt: true,
} satisfies Prisma.TicketSelect;
const staffSummarySelect = { ...summarySelect, owner: { select: { id: true, name: true } } } satisfies Prisma.TicketSelect;

const metric = (value: number, query: Record<string, string> | null) => ({ value, query });

// ---------------------------------------------------------------------------
// §3.1 — GET /api/dashboard/requester (BR-28): only the session user's own Tickets
// ---------------------------------------------------------------------------
dashboardRouter.get("/requester", ...asRequester, async (req: Request, res: Response) => {
  const mine = { requesterId: req.user!.id };
  const now = new Date();
  const since = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const prisma = getPrisma();
    const [open, waitingForMe, resolved, closed, needsAttention, recentlyUpdated, recentlyResolved] = await prisma.$transaction(
      [
        prisma.ticket.count({ where: { ...mine, currentStatus: ACTIVE } }),
        prisma.ticket.count({ where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" } }),
        prisma.ticket.count({ where: { ...mine, currentStatus: "RESOLVED" } }),
        prisma.ticket.count({ where: { ...mine, currentStatus: "CLOSED" } }),
        prisma.ticket.findMany({
          where: { ...mine, currentStatus: { in: ["WAITING_FOR_REQUESTER", "RESOLVED"] } },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }], // oldest waiting first
          take: LIST_SIZE,
          select: summarySelect,
        }),
        prisma.ticket.findMany({ where: mine, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: LIST_SIZE, select: summarySelect }),
        prisma.ticket.findMany({
          where: { ...mine, resolvedAt: { gte: since } },
          orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
          take: LIST_SIZE,
          select: summarySelect,
        }),
      ],
      snapshot
    );
    res.status(200).json({
      generatedAt: now,
      recentWindowDays: RECENT_WINDOW_DAYS,
      metrics: {
        open: metric(open, { statusGroup: "active" }),
        waitingForMe: metric(waitingForMe, { currentStatus: "WAITING_FOR_REQUESTER" }),
        resolved: metric(resolved, { currentStatus: "RESOLVED" }),
        closed: metric(closed, { currentStatus: "CLOSED" }),
      },
      needsAttention,
      recentlyUpdated,
      recentlyResolved,
    });
  } catch {
    res.status(500).json({ error: "Unable to load dashboard" });
  }
});

// ---------------------------------------------------------------------------
// §3.2 — GET /api/dashboard/staff (BR-29, + BR-30 userCounts for Administrators)
// ---------------------------------------------------------------------------
dashboardRouter.get("/staff", ...asStaff, async (req: Request, res: Response) => {
  const me = req.user!.id;
  const isAdmin = req.user!.role === "ADMIN";
  const myOpenActionsWhere = {
    performedById: me,
    status: { in: ["PLANNED", "IN_PROGRESS"] },
    ticket: { currentStatus: ACTIVE },
  } satisfies Prisma.ActionTakenWhereInput;
  try {
    const prisma = getPrisma();
    const [statusGroups, priorityGroups, unassigned, mine, highPriority, appearsResolved, myOpenActionCount, myOpenActions, urgent, recentlyUpdated, ...users] =
      await prisma.$transaction(
        [
          prisma.ticket.groupBy({ by: ["currentStatus"], _count: { _all: true }, orderBy: { currentStatus: "asc" } }),
          prisma.ticket.groupBy({ by: ["itPriority"], where: { currentStatus: ACTIVE }, _count: { _all: true }, orderBy: { itPriority: "asc" } }),
          prisma.ticket.count({ where: { currentStatus: ACTIVE, ownerId: null } }),
          prisma.ticket.count({ where: { currentStatus: ACTIVE, ownerId: me } }),
          prisma.ticket.count({ where: { currentStatus: ACTIVE, itPriority: "HIGH" } }),
          prisma.ticket.count({ where: { currentStatus: ACTIVE, requesterResolvedAt: { not: null } } }),
          prisma.actionTaken.count({ where: myOpenActionsWhere }),
          prisma.actionTaken.findMany({
            where: myOpenActionsWhere,
            orderBy: [{ actionAt: "asc" }, { id: "asc" }],
            take: LIST_SIZE,
            select: { id: true, description: true, status: true, actionAt: true, ticket: { select: { ticketNumber: true, summary: true } } },
          }),
          prisma.ticket.findMany({
            where: { currentStatus: ACTIVE, itPriority: "HIGH" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }], // oldest first
            take: LIST_SIZE,
            select: staffSummarySelect,
          }),
          prisma.ticket.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: LIST_SIZE, select: staffSummarySelect }),
          ...(isAdmin
            ? [
                prisma.user.count({ where: { isActive: true, role: "REQUESTER" } }),
                prisma.user.count({ where: { isActive: true, role: "IT_STAFF" } }),
                prisma.user.count({ where: { isActive: true, role: "ADMIN" } }),
                prisma.user.count({ where: { isActive: false } }),
              ]
            : []),
        ],
        snapshot
      );

    // Every status / priority appears, with 0 when nothing matches (BR-31).
    const byStatus = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
    for (const g of statusGroups) byStatus[g.currentStatus] = (g._count as { _all: number })._all;
    const byItPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<(typeof PRIORITIES)[number], number>;
    for (const g of priorityGroups) byItPriority[g.itPriority] = (g._count as { _all: number })._all;

    res.status(200).json({
      generatedAt: new Date(),
      recentWindowDays: RECENT_WINDOW_DAYS,
      metrics: {
        new: metric(byStatus.NEW, { status: "NEW" }),
        inProgress: metric(byStatus.IN_PROGRESS, { status: "IN_PROGRESS" }),
        waitingForRequester: metric(byStatus.WAITING_FOR_REQUESTER, { status: "WAITING_FOR_REQUESTER" }),
        reopened: metric(byStatus.REOPENED, { status: "REOPENED" }),
        unassigned: metric(unassigned, { statusGroup: "active", owner: "unassigned" }),
        mine: metric(mine, { statusGroup: "active", owner: "me" }),
        highPriority: metric(highPriority, { statusGroup: "active", itPriority: "HIGH" }),
        appearsResolved: metric(appearsResolved, { statusGroup: "active", appearsResolved: "true" }),
        myOpenActions: metric(myOpenActionCount, null),
      },
      byStatus,
      byItPriority,
      myOpenActions: myOpenActions.map((a) => ({
        id: a.id,
        ticketNumber: a.ticket.ticketNumber,
        ticketSummary: a.ticket.summary,
        description: a.description,
        status: a.status,
        actionAt: a.actionAt,
      })),
      urgent,
      recentlyUpdated,
      ...(isAdmin
        ? { userCounts: { requesters: users[0] as number, itStaff: users[1] as number, administrators: users[2] as number, inactive: users[3] as number } }
        : {}),
    });
  } catch {
    res.status(500).json({ error: "Unable to load dashboard" });
  }
});
