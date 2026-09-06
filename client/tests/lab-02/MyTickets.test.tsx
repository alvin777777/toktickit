import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

  // Each test sets up its own getMyTickets mock queue; without this, leftover queued
  // mockResolvedValueOnce/mockImplementationOnce calls from one test could leak into the next,
  // since vi.spyOn reuses the same underlying spy for a method that's already spied.
  afterEach(() => {
    vi.restoreAllMocks();
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

  // Requested by review on PR #26 — the range text used items.length/a hard-coded 10 instead of
  // the real pageSize, so a partial page (e.g. page 2 of 15 items) showed the wrong range.
  it("shows the correct 'Showing X to Y of Z' range on a partial page", async () => {
    const spy = vi
      .spyOn(api, "getMyTickets")
      .mockResolvedValueOnce({ items: [ticket()], page: 1, pageSize: 10, totalItems: 15, totalPages: 2 })
      .mockResolvedValueOnce({
        items: [ticket({ id: 11 }), ticket({ id: 12 }), ticket({ id: 13 }), ticket({ id: 14 }), ticket({ id: 15 })],
        page: 2,
        pageSize: 10,
        totalItems: 15,
        totalPages: 2,
      });
    const user = userEvent.setup();
    renderMyTickets();

    await screen.findAllByText("Laptop battery drains quickly");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/showing 11 to 15 of 15 tickets/i)).toBeInTheDocument();
    expect(spy).toHaveBeenLastCalledWith(1, expect.objectContaining({ page: 2 }));
  });

  // Requested by review on PR #26 — a slower earlier request resolving after a faster later one
  // used to overwrite the newest results with stale ones (breaks AC-11 for fast typers).
  it("ignores a slow, stale response that resolves after a newer one", async () => {
    let resolveFirst: (v: api.TicketListResult) => void = () => {};
    const spy = vi.spyOn(api, "getMyTickets").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    renderMyTickets();

    // First render kicks off the initial (slow) load; one atomic change triggers a second,
    // faster one (fireEvent.change, not user.type, so this is exactly one extra call — user.type
    // fires one event per keystroke, which would trigger a load() per character).
    spy.mockResolvedValueOnce({
      items: [ticket({ id: 2, summary: "battery issue" })],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    fireEvent.change(screen.getByLabelText(/search tickets/i), { target: { value: "battery" } });
    await screen.findAllByText("battery issue");

    // Now the stale first request finally resolves — it must not clobber "battery issue".
    resolveFirst({ items: [ticket({ id: 1 })], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });

    await waitFor(() => expect(screen.getAllByText("battery issue").length).toBeGreaterThan(0));
    expect(screen.queryAllByText("Laptop battery drains quickly")).toHaveLength(0);
  });
});
