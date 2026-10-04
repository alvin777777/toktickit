import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { asRequester, authenticated, requireRole } from "../middleware/auth.js";
import { isCommentable, isTerminal } from "../services/ticketWorkflow.js";
import { authorSelect, serializeEntry, validateEntryBody } from "../services/ticketSerializers.js";

// Lab 3 Issue 4 — Public Comments and the Requester's "appears resolved" signal
// (docs/lab-03/api-spec.md §3.6–§3.8). Mounted under /api/tickets.
export const commentsRouter = Router();

// A Requester may only reach their own Ticket (404 otherwise — BR-17); IT Staff / Administrators
// reach any Ticket. Resolved once here so both comment routes share it.
async function findTicketForComments(req: Request) {
  const where =
    req.user!.role === "REQUESTER"
      ? { ticketNumber: req.params.ticketNumber, requesterId: req.user!.id }
      : { ticketNumber: req.params.ticketNumber };
  return getPrisma().ticket.findFirst({ where, select: { id: true, currentStatus: true } });
}

const anyRole = [...authenticated, requireRole("REQUESTER", "IT_STAFF", "ADMIN")];

// ---------------------------------------------------------------------------
// api-spec.md §3.6 — GET /api/tickets/:ticketNumber/comments
// ---------------------------------------------------------------------------
commentsRouter.get("/:ticketNumber/comments", ...anyRole, async (req: Request, res: Response) => {
  try {
    const ticket = await findTicketForComments(req);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const comments = await getPrisma().ticketComment.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "asc" }, // BR-39
      include: { author: authorSelect },
    });
    res.status(200).json(comments.map(serializeEntry));
  } catch {
    res.status(500).json({ error: "Unable to load comments" });
  }
});

// ---------------------------------------------------------------------------
// api-spec.md §3.7 — POST /api/tickets/:ticketNumber/comments
// ---------------------------------------------------------------------------
commentsRouter.post("/:ticketNumber/comments", ...anyRole, async (req: Request, res: Response) => {
  const { body, error } = validateEntryBody(req.body?.body);
  if (error) return res.status(400).json({ error: "Invalid comment", fields: { body: `Comment must be 1-2000 characters.` } });

  try {
    const ticket = await findTicketForComments(req);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (!isCommentable(ticket.currentStatus)) {
      return res.status(409).json({ error: "Comments are closed for this ticket", code: "TICKET_NOT_COMMENTABLE" });
    }
    // BR-36 — author and timestamp come from the session and the server clock.
    const comment = await getPrisma().ticketComment.create({
      data: { ticketId: ticket.id, authorId: req.user!.id, body: body! },
      include: { author: authorSelect },
    });
    res.status(201).json(serializeEntry(comment));
  } catch {
    res.status(500).json({ error: "Unable to post comment" });
  }
});

// ---------------------------------------------------------------------------
// api-spec.md §3.8 — POST /api/tickets/:ticketNumber/requester-resolved (BR-32)
// ---------------------------------------------------------------------------
commentsRouter.post("/:ticketNumber/requester-resolved", ...asRequester, async (req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber: req.params.ticketNumber, requesterId: req.user!.id },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    // BR-32 / AC-35 — exactly once: the "not yet indicated and not terminal" test and the write are a
    // single conditional UPDATE, so two simultaneous requests yield one 200 and one 409 (review on
    // PR #42). Status is deliberately untouched (handout BR-05).
    const marked = await prisma.ticket.updateMany({
      where: { id: ticket.id, requesterResolvedAt: null, currentStatus: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] } },
      data: { requesterResolvedAt: new Date() },
    });
    if (marked.count === 0) {
      const current = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      if (isTerminal(current.currentStatus) || current.currentStatus === "RESOLVED") {
        return res.status(409).json({ error: "This ticket is already resolved or closed.", code: "TICKET_TERMINAL" });
      }
      return res.status(409).json({ error: "You already indicated this problem appears resolved.", code: "ALREADY_INDICATED" });
    }
    const updated = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { attachments: { orderBy: { uploadedAt: "asc" } }, owner: { select: { id: true, name: true } } },
    });
    res.status(200).json({
      id: updated.id,
      ticketNumber: updated.ticketNumber,
      ticketDate: updated.createdAt,
      requesterId: updated.requesterId,
      categoryId: updated.categoryId,
      relatedSystemId: updated.relatedSystemId,
      summary: updated.summary,
      description: updated.description,
      requestedPriority: updated.requestedPriority,
      itPriority: updated.itPriority,
      currentStatus: updated.currentStatus,
      owner: updated.owner,
      requesterResolvedAt: updated.requesterResolvedAt,
      attachments: updated.attachments.map((a) => ({
        id: a.id,
        ticketId: a.ticketId,
        originalFilename: a.originalFilename,
        sizeBytes: a.sizeBytes,
        mimeType: a.mimeType,
        uploadedAt: a.uploadedAt,
        removedAt: a.removedAt,
        removedReason: a.removedReason,
      })),
    });
  } catch {
    res.status(500).json({ error: "Unable to update ticket" });
  }
});
