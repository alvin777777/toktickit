import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MyTickets from "../../src/pages/MyTickets.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

const REQUESTER = { id: 1, name: "Jennifer Anderson", email: "jennifer@toktickit.dev" };

function renderMyTickets() {
  localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(REQUESTER));
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <MyTickets />
      </RequesterProvider>
    </MemoryRouter>
  );
}

function ticket(overrides: Partial<api.TicketListItem> = {}): api.TicketListItem {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    summary: "Laptop battery drains quickly",
    categoryId: 1,
    requestedPriority: "MEDIUM",
    currentStatus: "NEW",
    createdAt: "2026-09-06T10:00:00.000Z",
    updatedAt: "2026-09-06T10:00:00.000Z",
    ...overrides,
  };
}

describe("MyTickets", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
  });

  // UI-10 (AC-09, BR-21) — empty state, not no-results, when the Requester owns zero tickets.
  it("shows the empty state (not no-results) when the requester has zero tickets", async () => {
    vi.spyOn(api, "getMyTickets").mockResolvedValue({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
    renderMyTickets();

    expect(await screen.findByText(/haven't created any tickets yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tickets match your filters/i)).not.toBeInTheDocument();
  });

  // UI-11 (AC-10, BR-21) — no-results state when filters exclude everything.
  it("shows the no-results state when filters match nothing", async () => {
    const spy = vi
      .spyOn(api, "getMyTickets")
      .mockResolvedValueOnce({ items: [ticket()], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 })
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
    const user = userEvent.setup();
    renderMyTickets();

    await screen.findAllByText("Laptop battery drains quickly");
    await user.type(screen.getByLabelText(/search tickets/i), "nonexistent-xyz");

    await waitFor(() => {
      expect(screen.getByText(/no tickets match your filters/i)).toBeInTheDocument();
    });
    expect(spy).toHaveBeenLastCalledWith(1, expect.objectContaining({ search: "nonexistent-xyz" }));
  });

  // UI-12 (AC-11) — search narrows the list to matching tickets.
  it("passes the search term through to the API", async () => {
    const spy = vi
      .spyOn(api, "getMyTickets")
      .mockResolvedValue({ items: [ticket()], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    const user = userEvent.setup();
    renderMyTickets();

    await screen.findAllByText("Laptop battery drains quickly");
    await user.type(screen.getByLabelText(/search tickets/i), "battery");

    await waitFor(() => {
      expect(spy).toHaveBeenLastCalledWith(1, expect.objectContaining({ search: "battery" }));
    });
  });

  // UI-13 (AC-12) — pagination requests the correct page.
  it("requests the next page when Next is clicked", async () => {
    const spy = vi.spyOn(api, "getMyTickets").mockResolvedValue({
      items: [ticket()],
      page: 1,
      pageSize: 10,
      totalItems: 15,
      totalPages: 2,
    });
    const user = userEvent.setup();
    renderMyTickets();

    await screen.findAllByText("Laptop battery drains quickly");
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenLastCalledWith(1, expect.objectContaining({ page: 2 }));
    });
  });
});
