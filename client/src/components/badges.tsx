import { Priority, TicketStatus } from "../api.js";

// ui-spec.md §1.2 / §1.3 — the single shared badge maps used by every screen so My Tickets,
// Requester Detail, the Queue, and IT Staff Detail can never drift apart.
export const PRIORITY_BADGE: Record<Priority, string> = {
  LOW: "bg-secondary",
  MEDIUM: "bg-warning text-dark",
  HIGH: "bg-danger",
};

export const STATUS_BADGE: Record<TicketStatus, string> = {
  NEW: "bg-info text-dark",
  OPEN: "bg-primary",
  IN_PROGRESS: "text-white",
  WAITING_FOR_REQUESTER: "text-white",
  RESOLVED: "bg-success",
  CLOSED: "bg-dark",
  REOPENED: "bg-warning text-dark",
  CANCELLED: "bg-secondary",
};

const STATUS_BG: Partial<Record<TicketStatus, string>> = {
  IN_PROGRESS: "#0B7A46",
  WAITING_FOR_REQUESTER: "#B7791F",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

export const ALL_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

export const PRIORITY_LABEL: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge ${STATUS_BADGE[status]}`} style={STATUS_BG[status] ? { backgroundColor: STATUS_BG[status] } : undefined}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority, label }: { priority: Priority; label?: string }) {
  return (
    <span className={`badge ${PRIORITY_BADGE[priority]}`}>
      {label ? `${label}: ` : ""}
      {priority}
    </span>
  );
}
