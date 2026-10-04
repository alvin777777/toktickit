import type { Prisma } from "@prisma/client";
import { allowedTransitions } from "./ticketWorkflow.js";

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

export const staffDetailInclude = {
  requester: { select: { id: true, name: true, email: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, role: true } },
  attachments: { orderBy: { uploadedAt: "asc" } },
} satisfies Prisma.TicketInclude;

type StaffTicket = Prisma.TicketGetPayload<{ include: typeof staffDetailInclude }>;

// api-spec.md §4.3 — IT Staff Ticket Detail.
export function serializeStaffTicket(t: StaffTicket) {
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
    allowedTransitions: allowedTransitions(t.currentStatus),
    attachments: t.attachments.map(serializeAttachment),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// BR-37 — trimmed, 1–2000 characters.
export const ENTRY_MAX = 2000;
export function validateEntryBody(raw: unknown): { body?: string; error?: string } {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (body.length < 1 || body.length > ENTRY_MAX) return { error: `Must be 1-${ENTRY_MAX} characters.` };
  return { body };
}
