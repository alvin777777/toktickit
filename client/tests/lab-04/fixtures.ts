import * as api from "../../src/api.js";

// Shared Lab 4 UI fixtures (docs/lab-04/tests.md §2).
export function staffTicket(overrides: Partial<api.StaffTicket> = {}): api.StaffTicket {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    ticketDate: "2026-10-01T10:00:00.000Z",
    requester: { id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.dev" },
    category: { id: 1, name: "Hardware" },
    relatedSystem: { id: 7, name: "Corporate Laptop" },
    summary: "Laptop battery drains quickly",
    description: "Battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "IN_PROGRESS",
    owner: { id: 7, name: "Emily Davis", role: "IT_STAFF" },
    requesterResolvedAt: null,
    allowedTransitions: ["WAITING_FOR_REQUESTER", "CANCELLED"],
    version: 4,
    resolvedAt: null,
    resolution: { canResolve: false, blockers: ["OPEN_ACTIONS"] },
    actionCounts: { total: 2, open: 1, completed: 1, cancelled: 0 },
    statusHistory: [
      { id: 1, fromStatus: null, toStatus: "NEW", changedBy: null, changedAt: "2026-10-01T10:00:00.000Z" },
      { id: 2, fromStatus: "NEW", toStatus: "OPEN", changedBy: { id: 7, name: "Emily Davis", role: "IT_STAFF" }, changedAt: "2026-10-01T11:00:00.000Z" },
      { id: 3, fromStatus: "OPEN", toStatus: "IN_PROGRESS", changedBy: { id: 8, name: "Kevin Patel", role: "IT_STAFF" }, changedAt: "2026-10-02T09:00:00.000Z" },
    ],
    attachments: [],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-02T09:00:00.000Z",
    ...overrides,
  };
}

export function requesterTicket(overrides: Partial<api.TicketDetail> = {}): api.TicketDetail {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    ticketDate: "2026-10-01T10:00:00.000Z",
    requesterId: 1,
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Laptop battery drains quickly",
    description: "Battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "IN_PROGRESS",
    owner: { id: 7, name: "Emily Davis" },
    requesterResolvedAt: null,
    resolvedAt: null,
    statusHistory: staffTicket().statusHistory,
    attachments: [],
    ...overrides,
  };
}
