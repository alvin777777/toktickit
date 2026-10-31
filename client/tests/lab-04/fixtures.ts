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

const summary = (n: number, overrides: Partial<api.TicketSummary> = {}): api.TicketSummary => ({
  ticketNumber: `TKT-2026-00000${n}`,
  summary: `Ticket ${n}`,
  currentStatus: "IN_PROGRESS",
  itPriority: "MEDIUM",
  updatedAt: "2026-10-30T03:00:00.000Z",
  resolvedAt: null,
  ...overrides,
});

export function staffDashboard(overrides: Partial<api.StaffDashboardData> = {}): api.StaffDashboardData {
  return {
    generatedAt: "2026-10-31T05:00:00.000Z",
    recentWindowDays: 7,
    metrics: {
      new: { value: 2, query: { status: "NEW" } },
      inProgress: { value: 4, query: { status: "IN_PROGRESS" } },
      waitingForRequester: { value: 1, query: { status: "WAITING_FOR_REQUESTER" } },
      reopened: { value: 1, query: { status: "REOPENED" } },
      unassigned: { value: 3, query: { statusGroup: "active", owner: "unassigned" } },
      mine: { value: 5, query: { statusGroup: "active", owner: "me" } },
      highPriority: { value: 3, query: { statusGroup: "active", itPriority: "HIGH" } },
      appearsResolved: { value: 0, query: { statusGroup: "active", appearsResolved: "true" } },
      myOpenActions: { value: 2, query: null },
    },
    byStatus: { NEW: 2, OPEN: 3, IN_PROGRESS: 4, WAITING_FOR_REQUESTER: 1, RESOLVED: 2, CLOSED: 1, REOPENED: 1, CANCELLED: 1 },
    byItPriority: { LOW: 4, MEDIUM: 3, HIGH: 3 },
    myOpenActions: [
      { id: 5, ticketNumber: "TKT-2026-000001", ticketSummary: "Laptop battery drains quickly", description: "Replace the battery", status: "PLANNED", actionAt: "2026-10-31T03:00:00.000Z" },
    ],
    urgent: [summary(2, { itPriority: "HIGH", owner: null })],
    recentlyUpdated: [summary(3, { owner: { id: 7, name: "Emily Davis" } })],
    ...overrides,
  };
}

export function requesterDashboard(overrides: Partial<api.RequesterDashboardData> = {}): api.RequesterDashboardData {
  return {
    generatedAt: "2026-10-31T05:00:00.000Z",
    recentWindowDays: 7,
    metrics: {
      open: { value: 3, query: { statusGroup: "active" } },
      waitingForMe: { value: 1, query: { currentStatus: "WAITING_FOR_REQUESTER" } },
      resolved: { value: 1, query: { currentStatus: "RESOLVED" } },
      closed: { value: 12, query: { currentStatus: "CLOSED" } },
    },
    needsAttention: [summary(4, { currentStatus: "WAITING_FOR_REQUESTER" }), summary(5, { currentStatus: "RESOLVED" })],
    recentlyUpdated: [summary(6)],
    recentlyResolved: [summary(5, { currentStatus: "RESOLVED", resolvedAt: "2026-10-30T05:00:00.000Z" })],
    ...overrides,
  };
}

export const EMPTY_METRIC = (query: Record<string, string> | null) => ({ value: 0, query });
