import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import RequesterTicketDetail from "../../src/pages/RequesterTicketDetail.js";
import { renderWithAuth } from "../helpers/auth.js";
import * as api from "../../src/api.js";

// Lab 3: rendered as the authenticated seeded Requester (AuthProvider) instead of a selected one.
function renderDetail(ticketNumber = "TKT-2026-000001") {
  return renderWithAuth(<RequesterTicketDetail />, {
    route: `/tickets/${ticketNumber}`,
    path: "/tickets/:ticketNumber",
    extraRoutes: [{ path: "/tickets", element: <div>My Tickets Page</div> }],
  });
}

const TICKET: api.TicketDetail = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  ticketDate: "2026-09-06T10:00:00.000Z",
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "The battery drains much faster than usual, even when idle.",
  requestedPriority: "MEDIUM",
  itPriority: "MEDIUM",
  currentStatus: "NEW",
  owner: null,
  requesterResolvedAt: null,
  attachments: [],
};

describe("RequesterTicketDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // UI-14 (AC-13) — all header fields read-only, matching the stored ticket.
  it("renders the ticket header fields read-only, matching the stored ticket", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(TICKET);
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([{ id: 1, name: "Corporate Laptop" }]);
    renderDetail();

    expect(await screen.findByDisplayValue("TKT-2026-000001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/battery drains much faster/i)).toBeInTheDocument();
    expect(screen.getAllByText("MEDIUM")).toHaveLength(2); // Requested Priority + IT Priority (Lab 3 FR-12)
    expect(screen.getByText("New")).toBeInTheDocument(); // humanized status label (Lab 3 ui-spec §1.2)

    // Requested by review on PR #27 — Category, Related System, and Requester are also
    // required read-only header fields per ui-spec.md §5.5.
    expect(await screen.findByDisplayValue("Jennifer Anderson")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Unassigned")).toBeInTheDocument(); // Ticket Owner (Lab 3 FR-12)
    expect(await screen.findByDisplayValue("Hardware")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Corporate Laptop")).toBeInTheDocument();

    // read-only: no field can be typed into
    expect(screen.getByDisplayValue("TKT-2026-000001")).toHaveAttribute("readOnly");
    expect(screen.getByDisplayValue("Laptop battery drains quickly")).toHaveAttribute("readOnly");
    expect(screen.getByDisplayValue("Hardware")).toHaveAttribute("readOnly");
  });

  it("shows a not-found message for a ticket that doesn't exist or isn't owned (BR-22)", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(null);
    renderDetail("TKT-2026-999999");

    expect(await screen.findByText(/ticket not found/i)).toBeInTheDocument();
  });
});
