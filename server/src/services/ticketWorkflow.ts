import type { TicketStatus } from "@prisma/client";

// docs/lab-03/specification.md BR-25 — declaration order doubles as the sort order for the queue.
export const TICKET_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

// BR-30 — permitted status transitions (IT Staff / Administrator only).
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  REOPENED: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  CLOSED: ["REOPENED"],
  CANCELLED: [],
};

export function allowedTransitions(from: TicketStatus): TicketStatus[] {
  return [...TRANSITIONS[from]];
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as string[]).includes(value);
}

// BR-28 — CLOSED and CANCELLED freeze ownership / priority changes (CLOSED → REOPENED is the only
// status move allowed out of a terminal state, and it goes through the transition matrix above).
export function isTerminal(status: TicketStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

// BR-38 — Public Comments stop once a Ticket is closed or cancelled.
export function isCommentable(status: TicketStatus): boolean {
  return !isTerminal(status);
}

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type PriorityValue = (typeof PRIORITIES)[number];
export function isPriority(value: unknown): value is PriorityValue {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}
