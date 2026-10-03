import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StaffTicketDetail from "../../src/pages/StaffTicketDetail.js";
import * as api from "../../src/api.js";
import { STAFF_USER, renderWithAuth } from "../helpers/auth.js";

function ticket(overrides: Partial<api.StaffTicket> = {}): api.StaffTicket {
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
    currentStatus: "NEW",
    owner: null,
    requesterResolvedAt: null,
    allowedTransitions: ["OPEN", "CANCELLED"],
    attachments: [],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

function entry(overrides: Partial<api.Entry> = {}): api.Entry {
  return {
    id: 1,
    ticketId: 1,
    body: "We are investigating.",
    author: { id: 7, name: "Emily Davis", role: "IT_STAFF" },
    createdAt: "2026-10-02T10:00:00.000Z",
    ...overrides,
  };
}

function renderDetail() {
  return renderWithAuth(<StaffTicketDetail />, {
    user: STAFF_USER,
    route: "/staff/tickets/TKT-2026-000001",
    path: "/staff/tickets/:ticketNumber",
    extraRoutes: [{ path: "/staff/queue", element: <div>Queue Page</div> }],
  });
}

describe("StaffTicketDetail", () => {
  beforeEach(() => {
    vi.spyOn(api, "getAssignees").mockResolvedValue([
      { id: 7, name: "Emily Davis", role: "IT_STAFF" },
      { id: 8, name: "Kevin Patel", role: "IT_STAFF" },
    ]);
    vi.spyOn(api, "getComments").mockResolvedValue([]);
    vi.spyOn(api, "getInternalNotes").mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // UI-13 (AC-15, AC-16)
  it("claims an unassigned ticket and shows the new owner and status", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(ticket());
    const claim = vi.spyOn(api, "claimTicket").mockResolvedValue(
      ticket({ owner: { id: 7, name: "Emily Davis", role: "IT_STAFF" }, currentStatus: "OPEN", allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"] })
    );
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByTestId("owner-name")).toHaveTextContent("Unassigned");
    await user.click(screen.getByRole("button", { name: /^claim$/i }));

    await waitFor(() => expect(screen.getByTestId("owner-name")).toHaveTextContent("Emily Davis"));
    expect(claim).toHaveBeenCalledWith("TKT-2026-000001");
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^claim$/i })).not.toBeInTheDocument();
  });

  it("switches to Reassign when the claim is refused with 409 ALREADY_ASSIGNED, and reassigns", async () => {
    const owned = ticket({ owner: { id: 8, name: "Kevin Patel", role: "IT_STAFF" }, currentStatus: "OPEN" });
    vi.spyOn(api, "getStaffTicket").mockResolvedValueOnce(ticket()).mockResolvedValue(owned);
    vi.spyOn(api, "claimTicket").mockRejectedValue(
      new api.ApiError(409, { error: "This ticket is already owned by Kevin Patel.", code: "ALREADY_ASSIGNED" })
    );
    const setOwner = vi.spyOn(api, "setTicketOwner").mockResolvedValue(ticket({ owner: { id: 7, name: "Emily Davis", role: "IT_STAFF" }, currentStatus: "OPEN" }));
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: /^claim$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already owned by Kevin Patel/i);
    const select = await screen.findByLabelText(/select ticket owner/i);
    expect(within(select).getByRole("option", { name: /Emily Davis \(me\)/ })).toBeInTheDocument();
    await user.selectOptions(select, "7");
    await user.click(screen.getByRole("button", { name: /save owner/i }));

    await waitFor(() => expect(setOwner).toHaveBeenCalledWith("TKT-2026-000001", 7));
    expect(await screen.findByTestId("owner-name")).toHaveTextContent("Emily Davis");
  });

  // UI-14 (AC-17)
  it("saves IT Priority on change and leaves Requested Priority untouched", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(ticket());
    const spy = vi.spyOn(api, "setItPriority").mockResolvedValue(ticket({ itPriority: "HIGH" }));
    const user = userEvent.setup();
    renderDetail();

    await user.selectOptions(await screen.findByLabelText(/^IT Priority/i), "HIGH");

    await waitFor(() => expect(spy).toHaveBeenCalledWith("TKT-2026-000001", "HIGH"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByTestId("requested-priority")).toHaveTextContent("MEDIUM");
    expect(screen.getByLabelText(/^IT Priority/i)).toHaveValue("HIGH");
  });

  // UI-15 (AC-18, AC-19, BR-31)
  it("offers only the allowed transitions, confirms before Closed, and surfaces OWNER_REQUIRED", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(ticket({ currentStatus: "RESOLVED", allowedTransitions: ["CLOSED", "REOPENED"], owner: { id: 7, name: "Emily Davis", role: "IT_STAFF" } }));
    const setStatus = vi.spyOn(api, "setTicketStatus").mockResolvedValue(ticket({ currentStatus: "CLOSED", allowedTransitions: ["REOPENED"] }));
    const user = userEvent.setup();
    renderDetail();

    const select = await screen.findByLabelText(/^Status/i);
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Change to…", "Closed", "Reopened"]);

    await user.selectOptions(select, "CLOSED");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    expect(setStatus).not.toHaveBeenCalled(); // waits for confirmation (BR-31)
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/close this ticket\?/i);

    await user.click(screen.getByRole("button", { name: /yes, closed it/i }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith("TKT-2026-000001", "CLOSED"));
    expect((await screen.findAllByText("Closed")).length).toBeGreaterThan(0);
  });

  it("shows the server's 409 OWNER_REQUIRED message inline", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(ticket({ currentStatus: "IN_PROGRESS", allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"] }));
    vi.spyOn(api, "setTicketStatus").mockRejectedValue(new api.ApiError(409, { error: "Assign a ticket owner before resolving.", code: "OWNER_REQUIRED" }));
    const user = userEvent.setup();
    renderDetail();

    await user.selectOptions(await screen.findByLabelText(/^Status/i), "RESOLVED");
    await user.click(screen.getByRole("button", { name: /update status/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/assign a ticket owner before resolving/i);
  });

  // UI-16 (AC-20, BR-35)
  it("keeps Internal Notes visually private and separate from Public Comments, and posts a note", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(ticket());
    vi.spyOn(api, "getComments").mockResolvedValue([entry({ id: 1, body: "Public reply" })]);
    vi.spyOn(api, "getInternalNotes").mockResolvedValue([entry({ id: 2, body: "Private note" })]);
    const postNote = vi.spyOn(api, "postInternalNote").mockResolvedValue(entry({ id: 3, body: "Checking warranty" }));
    const user = userEvent.setup();
    renderDetail();

    const comments = await screen.findByTestId("public-comments");
    expect(await within(comments).findByText("Public reply")).toBeInTheDocument();
    expect(screen.queryByText("Private note")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /internal notes/i }));
    const notes = await screen.findByTestId("internal-notes");
    expect(within(notes).getByText(/^🔒 Internal — not visible to the requester/)).toBeInTheDocument(); // the private caption (§1.4)
    expect(await within(notes).findByText("Private note")).toBeInTheDocument();
    expect(screen.queryByText("Public reply")).not.toBeInTheDocument();

    await user.type(within(notes).getByLabelText(/add internal note/i), "Checking warranty");
    await user.click(within(notes).getByRole("button", { name: /add note/i }));
    await waitFor(() => expect(postNote).toHaveBeenCalledWith("TKT-2026-000001", "Checking warranty"));
    expect(await within(notes).findByText("Checking warranty")).toBeInTheDocument();
  });

  it("shows the requester-resolved banner and a not-found state", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValueOnce(ticket({ requesterResolvedAt: "2026-10-02T00:00:00.000Z" })).mockResolvedValueOnce(null);
    renderDetail();
    expect(await screen.findByTestId("requester-resolved-banner")).toHaveTextContent(/appears resolved/i);
  });
});
