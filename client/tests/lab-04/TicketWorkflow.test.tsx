import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StaffTicketDetail from "../../src/pages/StaffTicketDetail.js";
import RequesterTicketDetail from "../../src/pages/RequesterTicketDetail.js";
import * as api from "../../src/api.js";
import { STAFF_USER, renderWithAuth } from "../helpers/auth.js";
import { requesterTicket, staffTicket } from "./fixtures.js";

function renderStaff(route = "/staff/tickets/TKT-2026-000001") {
  return renderWithAuth(<StaffTicketDetail />, { user: STAFF_USER, route, path: "/staff/tickets/:ticketNumber" });
}

describe("Ticket workflow on IT Staff Ticket Detail", () => {
  beforeEach(() => {
    vi.spyOn(api, "getAssignees").mockResolvedValue([{ id: 7, name: "Emily Davis", role: "IT_STAFF" }]);
    vi.spyOn(api, "getComments").mockResolvedValue([]);
    vi.spyOn(api, "getInternalNotes").mockResolvedValue([]);
    vi.spyOn(api, "getStaffActions").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  // UI-08 (AC-17) — only server-permitted targets, plus the checklist while Resolved is blocked
  it("offers only allowedTransitions and explains why Resolved is missing", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(staffTicket());
    renderStaff();
    const select = await screen.findByLabelText("Status");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Change to…", "Waiting for Requester", "Cancelled"]);

    const checklist = screen.getByTestId("resolve-checklist");
    expect(checklist).toHaveTextContent("To resolve this ticket");
    expect(within(checklist).getByText(/No action is still planned or in progress/).closest("li")).toHaveTextContent("(missing)");
    expect(within(checklist).getByText(/A ticket owner is assigned/).closest("li")).toHaveTextContent("(done)");
  });

  it("hides the checklist once the gate holds and Resolved is offered", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(
      staffTicket({ allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"], resolution: { canResolve: true, blockers: [] } })
    );
    renderStaff();
    const select = await screen.findByLabelText("Status");
    expect(within(select).getByRole("option", { name: "Resolved" })).toBeInTheDocument();
    expect(screen.queryByTestId("resolve-checklist")).not.toBeInTheDocument();
  });

  // UI-08 (AC-12, AC-15) — the request carries expectedVersion; success refreshes the header badge
  it("sends the ticket version and refreshes the summary status on success", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(
      staffTicket({ allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"], resolution: { canResolve: true, blockers: [] } })
    );
    const setStatus = vi.spyOn(api, "setTicketStatus").mockResolvedValue(
      staffTicket({ currentStatus: "RESOLVED", version: 5, allowedTransitions: ["CLOSED", "REOPENED"], resolution: { canResolve: true, blockers: [] } })
    );
    const user = userEvent.setup();
    renderStaff();
    await user.selectOptions(await screen.findByLabelText("Status"), "RESOLVED");
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith("TKT-2026-000001", "RESOLVED", 4));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Resolved");
  });

  it("shows the latest server copy and a clear message on STALE_UPDATE", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(staffTicket());
    const latest = staffTicket({ version: 5, itPriority: "HIGH" });
    vi.spyOn(api, "setTicketStatus").mockRejectedValue(
      new api.ApiError(409, { error: "Someone else updated this ticket.", code: "STALE_UPDATE", current: latest })
    );
    const user = userEvent.setup();
    renderStaff();
    await user.selectOptions(await screen.findByLabelText("Status"), "WAITING_FOR_REQUESTER");
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    expect(await screen.findByText(/Someone else updated this ticket. Review the latest values/)).toBeInTheDocument();
    expect(screen.getByLabelText("IT Priority")).toHaveValue("HIGH");
  });

  it("reloads and shows the blockers when the server refuses with RESOLUTION_BLOCKED", async () => {
    const get = vi.spyOn(api, "getStaffTicket").mockResolvedValue(
      staffTicket({ allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"], resolution: { canResolve: true, blockers: [] } })
    );
    vi.spyOn(api, "setTicketStatus").mockRejectedValue(
      new api.ApiError(409, { error: "This ticket cannot be resolved yet.", code: "RESOLUTION_BLOCKED", blockers: ["OPEN_ACTIONS"] })
    );
    const user = userEvent.setup();
    renderStaff();
    await user.selectOptions(await screen.findByLabelText("Status"), "RESOLVED");
    get.mockResolvedValue(staffTicket());
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    expect(await screen.findByTestId("resolve-checklist")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This ticket cannot be resolved yet.");
  });

  // UI-09 (AC-14)
  it("lists status history oldest first with actor and role, and labels migration rows", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(staffTicket());
    renderStaff("/staff/tickets/TKT-2026-000001?tab=history");
    const history = await screen.findByTestId("status-history");
    const rows = within(history).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Created as");
    expect(rows[0]).toHaveTextContent("System (migration)");
    expect(rows[1]).toHaveTextContent(/New.*Open.*Emily Davis.*IT Staff/);
    expect(rows[2]).toHaveTextContent(/Open.*In Progress.*Kevin Patel/);
  });
});

describe("Requester status history", () => {
  afterEach(() => vi.restoreAllMocks());

  // UI-09 (AC-14)
  it("shows the same history read-only on the Requester's Ticket Detail", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(requesterTicket());
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);
    vi.spyOn(api, "getComments").mockResolvedValue([]);
    vi.spyOn(api, "getRequesterActions").mockResolvedValue([]);
    renderWithAuth(<RequesterTicketDetail />, { route: "/tickets/TKT-2026-000001", path: "/tickets/:ticketNumber" });
    const section = await screen.findByRole("region", { name: "Status history" });
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  });
});

// UI-10 (BR-35, AC-22) — drill-down targets read their filters from the URL.
import MyTickets from "../../src/pages/MyTickets.js";
import StaffTicketQueue from "../../src/pages/StaffTicketQueue.js";

describe("drill-down targets", () => {
  afterEach(() => vi.restoreAllMocks());

  it("My Tickets sends statusGroup / currentStatus from the URL and offers to clear the group", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    const list = vi.spyOn(api, "getMyTickets").mockResolvedValue({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
    const user = userEvent.setup();
    renderWithAuth(<MyTickets />, { route: "/tickets?statusGroup=active" });
    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ statusGroup: "active" })));
    await user.click(screen.getByRole("button", { name: "Show all statuses" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ statusGroup: undefined })));

    list.mockClear();
    renderWithAuth(<MyTickets />, { route: "/tickets?currentStatus=WAITING_FOR_REQUESTER" });
    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ currentStatus: "WAITING_FOR_REQUESTER" })));
  });

  it("the Ticket Queue sends owner / itPriority / statusGroup / appearsResolved from the URL", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getAssignees").mockResolvedValue([]);
    const q = vi.spyOn(api, "getStaffQueue").mockResolvedValue({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1, counts: { all: 3, unassigned: 1, mine: 1 } });
    renderWithAuth(<StaffTicketQueue />, { user: STAFF_USER, route: "/staff/queue?statusGroup=active&owner=unassigned&itPriority=HIGH&appearsResolved=true" });
    await waitFor(() =>
      expect(q).toHaveBeenCalledWith(expect.objectContaining({ statusGroup: "active", owner: "unassigned", itPriority: "HIGH", appearsResolved: "true" }))
    );
    expect(screen.getByTestId("drilldown-chips")).toHaveTextContent("Active tickets only");
    expect(screen.getByTestId("drilldown-chips")).toHaveTextContent("Requester says resolved");
    expect(screen.getByRole("button", { name: /^Unassigned/ })).toHaveClass("btn-success"); // the owner chip reflects the URL
  });
});
