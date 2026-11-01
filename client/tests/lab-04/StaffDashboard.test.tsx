import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StaffDashboard from "../../src/pages/StaffDashboard.js";
import AppShell from "../../src/components/AppShell.js";
import { AppRoutes } from "../../src/App.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ADMIN_USER, REQUESTER_USER, STAFF_USER, mockCurrentUser, renderWithAuth } from "../helpers/auth.js";
import { EMPTY_METRIC, staffDashboard } from "./fixtures.js";

afterEach(() => vi.restoreAllMocks());

const card = (name: RegExp) => screen.getByRole("link", { name });

// UI-01 (FR-12, AC-22)
describe("StaffDashboard", () => {
  it("shows every metric card with its value and a drill-down into the filtered Ticket Queue", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(staffDashboard());
    renderWithAuth(<StaffDashboard />, { user: STAFF_USER });
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back, Emily!" })).toBeInTheDocument();
    expect(within(screen.getByTestId("staff-metrics")).getAllByTestId("metric-card")).toHaveLength(9);
    expect(card(/^Unassigned: 3/)).toHaveAttribute("href", "/staff/queue?statusGroup=active&owner=unassigned");
    expect(card(/^My Assigned: 5/)).toHaveAttribute("href", "/staff/queue?statusGroup=active&owner=me");
    expect(card(/^New: 2/)).toHaveAttribute("href", "/staff/queue?status=NEW");
    expect(card(/^Appears Resolved: 0/)).toHaveAttribute("href", "/staff/queue?statusGroup=active&appearsResolved=true");
    expect(card(/^My Open Actions: 2. See list below/)).toHaveAttribute("href", "#my-open-actions");

    const actions = screen.getByRole("region", { name: "My Open Actions" });
    expect(within(actions).getByRole("link", { name: "TKT-2026-000001" })).toHaveAttribute("href", "/staff/tickets/TKT-2026-000001?tab=actions");
    expect(within(actions).getByText("Planned")).toBeInTheDocument();
    const urgent = screen.getByRole("region", { name: "Urgent — High IT priority" });
    expect(within(urgent).getByRole("link", { name: "TKT-2026-000002" })).toHaveAttribute("href", "/staff/tickets/TKT-2026-000002");
    expect(within(urgent).getByText("Owner: Unassigned")).toBeInTheDocument();
    const byStatus = screen.getByRole("region", { name: "Tickets by status" });
    expect(within(byStatus).getByRole("link", { name: /In Progress\s*4/ })).toHaveAttribute("href", "/staff/queue?status=IN_PROGRESS");
    expect(screen.queryByTestId("user-counts")).not.toBeInTheDocument();
  });

  // UI-02 (AC-21)
  it("adds the User accounts card only when the API returns userCounts (Administrator)", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(staffDashboard({ userCounts: { requesters: 5, itStaff: 3, administrators: 1, inactive: 2 } }));
    renderWithAuth(<StaffDashboard />, { user: ADMIN_USER });
    const users = await screen.findByTestId("user-counts");
    expect(users).toHaveAttribute("href", "/admin/users");
    expect(users).toHaveAccessibleName(/5 requesters, 3 IT staff, 1 administrators active, 2 inactive/);
  });

  // UI-02 (AC-20, AC-24)
  it("shows loading, then a safe failure with Retry that recovers", async () => {
    const get = vi.spyOn(api, "getStaffDashboard").mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(staffDashboard());
    const user = userEvent.setup();
    renderWithAuth(<StaffDashboard />, { user: STAFF_USER });
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard…");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the dashboard right now.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("staff-metrics")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shows 0 values and empty lines instead of hiding anything", async () => {
    const zero = staffDashboard();
    for (const key of Object.keys(zero.metrics) as api.StaffMetricKey[]) zero.metrics[key] = EMPTY_METRIC(zero.metrics[key].query);
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue({ ...zero, myOpenActions: [], urgent: [], recentlyUpdated: [] });
    renderWithAuth(<StaffDashboard />, { user: STAFF_USER });
    await screen.findByTestId("staff-metrics");
    for (const c of screen.getAllByTestId("metric-card")) expect(c).toHaveAccessibleName(/: 0\./);
    expect(screen.getByText("You have no planned or in-progress actions.")).toBeInTheDocument();
    expect(screen.getByText("No open high-priority tickets.")).toBeInTheDocument();
    expect(screen.getByText("No tickets yet.")).toBeInTheDocument();
  });
});

// UI-11 (FR-15, BR-38)
describe("Dashboard navigation", () => {
  it.each([
    [REQUESTER_USER, ["Dashboard", "My Tickets", "Create Ticket"]],
    [STAFF_USER, ["Dashboard", "Ticket Queue"]],
    [ADMIN_USER, ["Dashboard", "Ticket Queue", "Users"]],
  ])("puts Dashboard first and marks the active page (%o)", async (user, expected) => {
    renderWithAuth(
      <AppShell>
        <div>content</div>
      </AppShell>,
      { user, route: "/dashboard" }
    );
    const nav = await screen.findByRole("list");
    const links = within(nav).getAllByRole("link").map((l) => l.textContent);
    expect(links).toEqual(expected);
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("sends / to /dashboard for a signed-in user", async () => {
    mockCurrentUser(STAFF_USER);
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(staffDashboard());
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back, Emily!" })).toBeInTheDocument();
  });
});
