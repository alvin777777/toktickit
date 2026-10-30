import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { asRequester } from "../middleware/auth.js";
import {
  ACTION_CREATE_STATUSES,
  ActionFields,
  actionInclude,
  actionOrder,
  allowedActionTransitions,
  canActionTransition,
  isActionFinal,
  isActionStatus,
  isWorkable,
  serializeAction,
  validateAction,
} from "../services/actions.js";
import { HttpError, sendError as send } from "../services/httpError.js";

// Lab 4 Issue 2 — Actions Taken (docs/lab-04/api-spec.md §1). The staff router is mounted inside
// staffRouter (already behind asStaff) at /tickets/:ticketNumber/actions; the Requester router is
// mounted at /api/tickets and is read-only (BR-15).
export const staffActionsRouter = Router({ mergeParams: true });
export const requesterActionsRouter = Router();

type Tx = Prisma.TransactionClient;

const notWorkable = () =>
  new HttpError(409, { error: "This ticket is resolved, closed, or cancelled. Reopen it to record more actions.", code: "TICKET_NOT_WORKABLE" });
const invalid = (fields: Record<string, string>) => new HttpError(400, { error: "Invalid action", fields });

// BR-26 — every action write locks the Ticket row first, so it serialises with status changes.
async function lockTicket(tx: Tx, ticketId: number) {
  const rows = await tx.$queryRaw<{ currentStatus: string }[]>`SELECT "currentStatus"::text FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
  return rows[0]?.currentStatus as Parameters<typeof isWorkable>[0] | undefined;
}

// BR-03 — a performer must be an active IT Staff / Administrator.
async function assertPerformer(tx: Tx, performedById: number) {
  const user = await tx.user.findUnique({ where: { id: performedById }, select: { isActive: true, role: true } });
  if (!user || !user.isActive || user.role === "REQUESTER") {
    throw invalid({ performedById: "Select an active IT Staff or Administrator." });
  }
}

function findTicket(ticketNumber: string) {
  return getPrisma().ticket.findUnique({ where: { ticketNumber }, select: { id: true, createdAt: true, currentStatus: true } });
}

// ---------------------------------------------------------------------------
// §1.1 — GET /api/staff/tickets/:ticketNumber/actions
// ---------------------------------------------------------------------------
staffActionsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const ticket = await findTicket(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const actions = await getPrisma().actionTaken.findMany({ where: { ticketId: ticket.id }, orderBy: actionOrder, include: actionInclude });
    res.status(200).json(actions.map(serializeAction));
  } catch {
    res.status(500).json({ error: "Unable to load actions" });
  }
});

// ---------------------------------------------------------------------------
// §1.2 — POST /api/staff/tickets/:ticketNumber/actions
// ---------------------------------------------------------------------------
const CLIENT_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

staffActionsRouter.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const actorId = req.user!.id;
  const prisma = getPrisma();
  try {
    const ticket = await findTicket(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const clientRequestId = typeof body.clientRequestId === "string" && CLIENT_REQUEST_ID.test(body.clientRequestId) ? body.clientRequestId : null;
    // BR-14 — a replayed create returns the action it already made.
    const replay = async () => {
      if (!clientRequestId) return null;
      const existing = await prisma.actionTaken.findUnique({ where: { clientRequestId }, include: actionInclude });
      if (!existing) return null;
      if (existing.ticketId !== ticket.id) {
        throw new HttpError(409, { error: "This request was already used for another ticket.", code: "DUPLICATE_REQUEST" });
      }
      return existing;
    };
    const previous = await replay();
    if (previous) return res.status(200).json(serializeAction(previous));

    const status = body.status === undefined ? "COMPLETED" : body.status;
    const errors: Record<string, string> = {};
    if (!isActionStatus(status) || !ACTION_CREATE_STATUSES.includes(status)) errors.status = "Select a valid status.";
    const { fields, errors: fieldErrors } = validateAction(body, {
      status: isActionStatus(status) ? status : "COMPLETED",
      actorId,
      ticketCreatedAt: ticket.createdAt,
      now: new Date(),
    });
    Object.assign(errors, fieldErrors);
    if (Object.keys(errors).length > 0) throw invalid(errors);

    const created = await prisma.$transaction(async (tx) => {
      const current = await lockTicket(tx, ticket.id);
      if (!current || !isWorkable(current)) throw notWorkable();
      await assertPerformer(tx, fields!.performedById);
      const now = new Date();
      const action = await tx.actionTaken.create({
        data: {
          ...fields!,
          ticketId: ticket.id,
          createdById: actorId, // BR-03 — never taken from the client
          clientRequestId,
          completedAt: fields!.status === "COMPLETED" ? now : null,
        },
        include: actionInclude,
      });
      await tx.ticket.update({ where: { id: ticket.id }, data: { updatedAt: now } }); // new work = recently updated
      return action;
    });
    res.status(201).json(serializeAction(created));
  } catch (err) {
    // BR-14 — two simultaneous replays: the loser hits the unique index and returns the winner's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      try {
        const existing = await prisma.actionTaken.findUnique({ where: { clientRequestId: String(body.clientRequestId) }, include: actionInclude });
        if (existing) return res.status(200).json(serializeAction(existing));
      } catch {
        /* fall through to the safe 500 */
      }
    }
    send(res, err, "Unable to save action");
  }
});

// ---------------------------------------------------------------------------
// §1.3 — PATCH /api/staff/tickets/:ticketNumber/actions/:actionId
// ---------------------------------------------------------------------------
staffActionsRouter.patch("/:actionId", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const actionId = Number(req.params.actionId);
  const version = body.version;
  if (!(Number.isInteger(version) && (version as number) > 0)) {
    return res.status(400).json({ error: "Invalid action", fields: { version: "Version is required." } });
  }
  try {
    const ticket = await findTicket(req.params.ticketNumber);
    if (!ticket || !Number.isInteger(actionId)) return res.status(404).json({ error: "Action not found" });
    const prisma = getPrisma();

    const updated = await prisma.$transaction(async (tx) => {
      const current = await lockTicket(tx, ticket.id);
      // BR-01 — the action must belong to the Ticket in the URL.
      const action = await tx.actionTaken.findFirst({ where: { id: actionId, ticketId: ticket.id }, include: actionInclude });
      if (!action) throw new HttpError(404, { error: "Action not found" });
      if (!current || !isWorkable(current)) throw notWorkable();
      // BR-13 — stale first: the user's view is out of date, whatever else changed.
      if (action.version !== version) {
        throw new HttpError(409, { error: "This action was changed by someone else.", code: "STALE_UPDATE", current: serializeAction(action) });
      }
      if (isActionFinal(action.status)) {
        throw new HttpError(409, { error: "Completed and cancelled actions cannot be changed. Record a new action instead.", code: "ACTION_FINAL" });
      }
      let status = action.status;
      if (body.status !== undefined && body.status !== action.status) {
        if (!isActionStatus(body.status)) throw invalid({ status: "Select a valid status." });
        if (!canActionTransition(action.status, body.status)) {
          throw new HttpError(409, {
            error: `Cannot move an action from ${action.status} to ${body.status}.`,
            code: "INVALID_ACTION_TRANSITION",
            allowed: allowedActionTransitions(action.status),
          });
        }
        status = body.status;
      }
      const existing: ActionFields = {
        actionAt: action.actionAt,
        description: action.description,
        result: action.result,
        status: action.status,
        performedById: action.performedById,
        followUpRequired: action.followUpRequired,
        followUpNote: action.followUpNote,
        attachmentNotes: action.attachmentNotes,
      };
      const { fields, errors } = validateAction(body, { existing, status, actorId: req.user!.id, ticketCreatedAt: ticket.createdAt, now: new Date() });
      if (!fields) throw invalid(errors);
      if (fields.performedById !== action.performedById) await assertPerformer(tx, fields.performedById);

      const now = new Date();
      const written = await tx.actionTaken.updateMany({
        where: { id: action.id, version: action.version },
        data: {
          ...fields,
          version: { increment: 1 },
          ...(status === "COMPLETED" && action.status !== "COMPLETED" ? { completedAt: now } : {}),
          ...(status === "CANCELLED" ? { cancelledAt: now } : {}),
        },
      });
      if (written.count === 0) {
        const latest = await tx.actionTaken.findUniqueOrThrow({ where: { id: action.id }, include: actionInclude });
        throw new HttpError(409, { error: "This action was changed by someone else.", code: "STALE_UPDATE", current: serializeAction(latest) });
      }
      await tx.ticket.update({ where: { id: ticket.id }, data: { updatedAt: now } });
      return tx.actionTaken.findUniqueOrThrow({ where: { id: action.id }, include: actionInclude });
    });
    res.status(200).json(serializeAction(updated));
  } catch (err) {
    send(res, err, "Unable to save action");
  }
});

// ---------------------------------------------------------------------------
// §1.4 — GET /api/tickets/:ticketNumber/actions (Requester, own Tickets only)
// ---------------------------------------------------------------------------
requesterActionsRouter.get("/:ticketNumber/actions", ...asRequester, async (req: Request, res: Response) => {
  try {
    const ticket = await getPrisma().ticket.findFirst({
      where: { ticketNumber: req.params.ticketNumber, requesterId: req.user!.id },
      select: { id: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" }); // BR-15 / L3 BR-17
    const actions = await getPrisma().actionTaken.findMany({ where: { ticketId: ticket.id }, orderBy: actionOrder, include: actionInclude });
    res.status(200).json(actions.map(serializeAction));
  } catch {
    res.status(500).json({ error: "Unable to load actions" });
  }
});
