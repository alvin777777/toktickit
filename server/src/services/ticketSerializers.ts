import type { Prisma } from "@prisma/client";
import { gatedTransitions, isActionOpen, resolutionBlockers } from "./actions.js";

// Shared response shapes for Lab 3 (docs/lab-03/api-spec.md §3.6, §4.3, §4.8). Every serializer
// lists its fields explicitly so internal columns can never leak by accident.

export const authorSelect = { select: { id: true, name: true, role: true } } satisfies Prisma.UserDefaultArgs;

export function serializeEntry(e: {
  id: number;
  ticketId: number;
  body: string;
  createdAt: Date;
  author: { id: number; name: string; role: string };
}) {
  return { id: e.id, ticketId: e.ticketId, body: e.body, author: e.author, createdAt: e.createdAt };
}

export function serializeAttachment(a: {
  id: number;
  ticketId: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: Date;
  removedAt: Date | null;
  removedReason: string | null;
}) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    originalFilename: a.originalFilename,
    sizeBytes: a.sizeBytes,
    mimeType: a.mimeType,
    uploadedAt: a.uploadedAt,
    removedAt: a.removedAt,
    removedReason: a.removedReason,
  };
}

// Lab 4 — append-only status history (docs/lab-04/specification.md BR-24), oldest first.
export const statusHistoryInclude = {
  orderBy: [{ changedAt: "asc" }, { id: "asc" }],
  include: { changedBy: authorSelect },
} satisfies Prisma.Ticket$statusHistoryArgs;

export function serializeHistory(h: {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  changedAt: Date;
  changedBy: { id: number; name: string; role: string } | null;
}) {
  return { id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, changedBy: h.changedBy, changedAt: h.changedAt };
}

export const staffDetailInclude = {
  requester: { select: { id: true, name: true, email: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, role: true } },
  attachments: { orderBy: { uploadedAt: "asc" } },
  // Lab 4 — the resolution gate's inputs (BR-20) and the history tab (BR-24).
  actions: { select: { id: true, status: true, actionAt: true, followUpRequired: true } },
  statusHistory: statusHistoryInclude,
} satisfies Prisma.TicketInclude;

type StaffTicket = Prisma.TicketGetPayload<{ include: typeof staffDetailInclude }>;

// api-spec.md §4.3 — IT Staff Ticket Detail; Lab 4 api-spec.md §2.1 adds version, resolvedAt,
// resolution, actionCounts, statusHistory, and RESOLVED is only offered when the gate holds (BR-21).
export function serializeStaffTicket(t: StaffTicket) {
  const blockers = resolutionBlockers(t, t.actions);
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    ticketDate: t.createdAt,
    requester: t.requester,
    category: t.category,
    relatedSystem: t.relatedSystem,
    summary: t.summary,
    description: t.description,
    requestedPriority: t.requestedPriority,
    itPriority: t.itPriority,
    currentStatus: t.currentStatus,
    owner: t.owner,
    requesterResolvedAt: t.requesterResolvedAt,
    version: t.version,
    resolvedAt: t.resolvedAt,
    allowedTransitions: gatedTransitions(t.currentStatus, blockers),
    resolution: { canResolve: blockers.length === 0, blockers },
    actionCounts: {
      total: t.actions.length,
      open: t.actions.filter((a) => isActionOpen(a.status)).length,
      completed: t.actions.filter((a) => a.status === "COMPLETED").length,
      cancelled: t.actions.filter((a) => a.status === "CANCELLED").length,
    },
    statusHistory: t.statusHistory.map(serializeHistory),
    attachments: t.attachments.map(serializeAttachment),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// Lab 2 api-spec §6 Requester Ticket Detail + Lab 3 owner/IT priority + Lab 4 resolvedAt and status
// history (api-spec.md §2.2). Shared by GET /api/tickets/:tn and the appears-resolved response so
// the two can never drift apart. No version, resolution, or internal data.
export const requesterDetailInclude = {
  attachments: { orderBy: { uploadedAt: "asc" } },
  owner: { select: { id: true, name: true } },
  statusHistory: statusHistoryInclude,
} satisfies Prisma.TicketInclude;

type RequesterTicket = Prisma.TicketGetPayload<{ include: typeof requesterDetailInclude }>;

export function serializeRequesterTicket(t: RequesterTicket) {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    ticketDate: t.createdAt,
    requesterId: t.requesterId,
    categoryId: t.categoryId,
    relatedSystemId: t.relatedSystemId,
    summary: t.summary,
    description: t.description,
    requestedPriority: t.requestedPriority,
    itPriority: t.itPriority,
    currentStatus: t.currentStatus,
    owner: t.owner, // { id, name } | null — L3 FR-12
    requesterResolvedAt: t.requesterResolvedAt,
    resolvedAt: t.resolvedAt,
    statusHistory: t.statusHistory.map(serializeHistory),
    attachments: t.attachments.map(serializeAttachment),
  };
}

// BR-37 — trimmed, 1–2000 characters.
export const ENTRY_MAX = 2000;
export function validateEntryBody(raw: unknown): { body?: string; error?: string } {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (body.length < 1 || body.length > ENTRY_MAX) return { error: `Must be 1-${ENTRY_MAX} characters.` };
  return { body };
}
