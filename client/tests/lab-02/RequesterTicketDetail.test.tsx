import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequesterTicketDetail from "../../src/pages/RequesterTicketDetail.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

const REQUESTER = { id: 1, name: "Jennifer Anderson", email: "jennifer@toktickit.dev" };

function renderDetail(ticketNumber = "TKT-2026-000001") {
  localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(REQUESTER));
  return render(
    <MemoryRouter initialEntries={[`/tickets/${ticketNumber}`]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:ticketNumber" element={<RequesterTicketDetail />} />
          <Route path="/tickets" element={<div>My Tickets Page</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
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
  currentStatus: "NEW",
  attachments: [],
};

describe("RequesterTicketDetail", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // UI-14 (AC-13) — all header fields read-only, matching the stored ticket.
  it("renders the ticket header fields read-only, matching the stored ticket", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(TICKET);
    renderDetail();

    expect(await screen.findByDisplayValue("TKT-2026-000001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/battery drains much faster/i)).toBeInTheDocument();
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    expect(screen.getByText("NEW")).toBeInTheDocument();

    // read-only: no field can be typed into
    expect(screen.getByDisplayValue("TKT-2026-000001")).toHaveAttribute("readOnly");
    expect(screen.getByDisplayValue("Laptop battery drains quickly")).toHaveAttribute("readOnly");
  });

  it("shows a not-found message for a ticket that doesn't exist or isn't owned (BR-22)", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(null);
    renderDetail("TKT-2026-999999");

    expect(await screen.findByText(/ticket not found/i)).toBeInTheDocument();
  });
});
