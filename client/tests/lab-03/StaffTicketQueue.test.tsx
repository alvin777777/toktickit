import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StaffTicketQueue from "../../src/pages/StaffTicketQueue.js";
import * as api from "../../src/api.js";
import { STAFF_USER, renderWithAuth } from "../helpers/auth.js";

function item(overrides: Partial<api.QueueItem> = {}): api.QueueItem {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    summary: "Laptop battery drains quickly",
    category: { id: 1, name: "Hardware" },
    requester: { id: 1, name: "Jennifer Anderson" },
    requestedPriority: "MEDIUM",
    itPriority: "HIGH",
    currentStatus: "IN_PROGRESS",
    owner: { id: 7, name: "Emily Davis" },
    requesterResolvedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-02T10:00:00.000Z",
    ...overrides,
  };
}

function result(items: api.QueueItem[], overrides: Partial<api.QueueResult> = {}): api.QueueResult {
  return {
    items,
    page: 1,
    pageSize: 10,
    totalItems: items.length,
    totalPages: 1,
    counts: { all: 14, unassigned: 4, mine: 3 },
    ...overrides,
  };
}

function renderQueue() {
  return renderWithAuth(<StaffTicketQueue />, {
    user: STAFF_USER,
    route: "/staff/queue",
    path: "/staff/queue",
    extraRoutes: [{ path: "/staff/tickets/:ticketNumber", element: <div>Ticket Detail Page</div> }],
  });
}

describe("StaffTicketQueue", () => {
  beforeEach(() => {
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
    vi.spyOn(api, "getAssignees").mockResolvedValue([{ id: 7, name: "Emily Davis", role: "IT_STAFF" }]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // UI-10 (AC-13) — all columns, badges, counts.
  it("renders queue rows with every column, both priorities, status, owner, and the count chips", async () => {
    vi.spyOn(api, "getStaffQueue").mockResolvedValue(
      result([item(), item({ id: 2, ticketNumber: "TKT-2026-000002", summary: "Printer keeps showing offline", owner: null, currentStatus: "OPEN", itPriority: "LOW", requesterResolvedAt: "2026-10-02T00:00:00.000Z" })])
    );
    renderQueue();

    const table = await screen.findByTestId("queue-table");
    const [, row1, row2] = within(table).getAllByRole("row"); // [header, row1, row2]
    expect(within(row1).getByText("TKT-2026-000001")).toBeInTheDocument();
    expect(within(row1).getByText("Jennifer Anderson")).toBeInTheDocument();
    expect(within(row1).getByText("Hardware")).toBeInTheDocument();
    expect(within(row1).getByText("Emily Davis")).toBeInTheDocument();
    expect(within(row1).getByText("In Progress")).toBeInTheDocument();
    expect(within(row1).getByText("MEDIUM")).toBeInTheDocument(); // requested
    expect(within(row1).getByText("HIGH")).toBeInTheDocument(); // IT priority
    expect(within(row2).getByText("Unassigned")).toBeInTheDocument();
    expect(within(row2).getByText("Open", { selector: "span" })).toBeInTheDocument(); // status badge, not the Open link
    expect(within(row2).getByText("LOW")).toBeInTheDocument();
    expect(within(row2).getByText(/requester says resolved/i)).toBeInTheDocument();
    for (const header of ["Ticket No.", "Created", "Summary", "Requester", "Category", "Req. Priority", "IT Priority", "Status", "Owner"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(header) })).toBeInTheDocument();
    }

    const chips = screen.getByTestId("queue-counts");
    expect(chips).toHaveTextContent("All 14");
    expect(chips).toHaveTextContent("Unassigned 4");
    expect(chips).toHaveTextContent("Mine 3");
  });

  // UI-11 (AC-14) — search / filter / chip / sort / page all reach the API with the right query.
  it("passes search, status filter, Mine chip, sort toggle, and Next page through to the API", async () => {
    const spy = vi.spyOn(api, "getStaffQueue").mockResolvedValue(result([item()], { totalItems: 25, totalPages: 3 }));
    const user = userEvent.setup();
    renderQueue();
    await screen.findByTestId("queue-table");

    await user.type(screen.getByLabelText(/search queue/i), "vpn");
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ search: "vpn" })));

    await user.selectOptions(screen.getByLabelText(/filter by status/i), "IN_PROGRESS");
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: "IN_PROGRESS" })));

    await user.click(within(screen.getByTestId("queue-counts")).getByRole("button", { name: /mine/i }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ owner: "me", page: 1 })));

    await user.click(screen.getByRole("button", { name: /IT Priority/ }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: "itPriority", sortDir: "asc" })));

    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it("never lets a slow, older response overwrite a newer one", async () => {
    let resolveFirst!: (value: api.QueueResult) => void;
    const spy = vi.spyOn(api, "getStaffQueue");
    spy.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    spy.mockResolvedValue(result([item({ summary: "Newest result" })]));
    const user = userEvent.setup();
    renderQueue();

    await user.type(screen.getByLabelText(/search queue/i), "x");
    // The table and the card layout are both in the DOM (CSS decides which is visible).
    expect((await screen.findAllByText("Newest result")).length).toBeGreaterThan(0);

    resolveFirst(result([item({ summary: "Stale result" })]));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryAllByText("Stale result")).toHaveLength(0);
    expect(screen.getAllByText("Newest result").length).toBeGreaterThan(0);
  });

  // UI-12 (§1.5) — empty / no-results / failure.
  it("shows the empty state when no tickets exist at all", async () => {
    vi.spyOn(api, "getStaffQueue").mockResolvedValue(result([], { counts: { all: 0, unassigned: 0, mine: 0 } }));
    renderQueue();
    expect(await screen.findByTestId("queue-empty")).toBeInTheDocument();
    expect(screen.queryByLabelText(/search queue/i)).not.toBeInTheDocument();
  });

  it("shows the no-results state with Clear Filters when filters exclude everything", async () => {
    const spy = vi
      .spyOn(api, "getStaffQueue")
      .mockResolvedValueOnce(result([item()]))
      .mockResolvedValue(result([], { totalItems: 0 }));
    const user = userEvent.setup();
    renderQueue();
    await screen.findByTestId("queue-table");

    await user.selectOptions(screen.getByLabelText(/filter by status/i), "CLOSED");
    expect(await screen.findByTestId("queue-no-results")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined, page: 1 })));
  });

  it("shows a safe failure banner with Retry when the API fails", async () => {
    const spy = vi.spyOn(api, "getStaffQueue").mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(result([item()]));
    const user = userEvent.setup();
    renderQueue();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load the ticket queue/i);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByTestId("queue-table")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
