import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RequesterTicketDetail from "../../src/pages/RequesterTicketDetail.js";
import * as api from "../../src/api.js";
import { renderWithAuth } from "../helpers/auth.js";

function ticket(overrides: Partial<api.TicketDetail> = {}): api.TicketDetail {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    ticketDate: "2026-10-01T10:00:00.000Z",
    requesterId: 1,
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Laptop battery drains quickly",
    description: "The battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: "HIGH",
    currentStatus: "IN_PROGRESS",
    owner: { id: 7, name: "Emily Davis" },
    requesterResolvedAt: null,
    attachments: [],
    ...overrides,
  };
}

function renderDetail() {
  return renderWithAuth(<RequesterTicketDetail />, {
    route: "/tickets/TKT-2026-000001",
    path: "/tickets/:ticketNumber",
    extraRoutes: [{ path: "/tickets", element: <div>My Tickets Page</div> }],
  });
}

// UI-17 (AC-11, AC-12) — Requester Ticket Detail additions (ui-spec.md §5).
describe("RequesterTicketDetail — comments and appears-resolved", () => {
  beforeEach(() => {
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([{ id: 1, name: "Corporate Laptop" }]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the owner and IT priority, lists comments, and posts a new comment", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(ticket());
    vi.spyOn(api, "getComments").mockResolvedValue([
      { id: 1, ticketId: 1, body: "We are investigating.", author: { id: 7, name: "Emily Davis", role: "IT_STAFF" }, createdAt: "2026-10-02T10:00:00.000Z" },
    ]);
    const post = vi.spyOn(api, "postComment").mockResolvedValue({
      id: 2, ticketId: 1, body: "Thanks!", author: { id: 1, name: "Jennifer Anderson", role: "REQUESTER" }, createdAt: "2026-10-02T11:00:00.000Z",
    });
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByDisplayValue("Emily Davis")).toBeInTheDocument(); // Ticket Owner
    expect(screen.getByText("HIGH")).toBeInTheDocument(); // IT Priority badge
    const thread = await screen.findByTestId("public-comments");
    expect(within(thread).getByText("We are investigating.")).toBeInTheDocument();
    expect(within(thread).getByText("IT Staff")).toBeInTheDocument();

    await user.type(within(thread).getByLabelText(/add a public comment/i), "Thanks!");
    await user.click(within(thread).getByRole("button", { name: /post comment/i }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("TKT-2026-000001", "Thanks!"));
    expect(await within(thread).findByText("Thanks!")).toBeInTheDocument();
    expect(within(thread).getByText("Requester")).toBeInTheDocument();
  });

  it("asks for confirmation before marking the problem resolved, then shows the chip", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(ticket());
    vi.spyOn(api, "getComments").mockResolvedValue([]);
    const mark = vi.spyOn(api, "markRequesterResolved").mockResolvedValue(ticket({ requesterResolvedAt: "2026-10-03T08:00:00.000Z" }));
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: /problem appears resolved/i }));
    expect(mark).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/appears resolved\?/i);

    await user.click(screen.getByRole("button", { name: /yes, it appears resolved/i }));
    await waitFor(() => expect(mark).toHaveBeenCalledWith("TKT-2026-000001"));
    expect(await screen.findByTestId("resolved-chip")).toHaveTextContent(/you indicated this problem appears resolved/i);
    expect(screen.queryByRole("button", { name: /problem appears resolved/i })).not.toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument(); // status unchanged (BR-32)
  });

  it("disables the composer and hides the resolved action on a closed ticket", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(ticket({ currentStatus: "CLOSED" }));
    vi.spyOn(api, "getComments").mockResolvedValue([]);
    renderDetail();

    const thread = await screen.findByTestId("public-comments");
    expect(within(thread).getByLabelText(/add a public comment/i)).toBeDisabled();
    expect(within(thread).getByText(/comments are closed for this ticket/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /problem appears resolved/i })).not.toBeInTheDocument();
  });

  it("shows a field message when posting an empty comment and never calls the API", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(ticket());
    vi.spyOn(api, "getComments").mockResolvedValue([]);
    const post = vi.spyOn(api, "postComment");
    const user = userEvent.setup();
    renderDetail();

    const thread = await screen.findByTestId("public-comments");
    await user.click(within(thread).getByRole("button", { name: /post comment/i }));
    expect(await within(thread).findByText(/enter a comment before posting/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
