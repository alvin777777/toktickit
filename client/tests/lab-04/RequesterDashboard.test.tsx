import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RequesterDashboard from "../../src/pages/RequesterDashboard.js";
import * as api from "../../src/api.js";
import { REQUESTER_USER, renderWithAuth } from "../helpers/auth.js";
import { EMPTY_METRIC, requesterDashboard } from "./fixtures.js";

afterEach(() => vi.restoreAllMocks());

// UI-03 (FR-11, AC-18, AC-22)
describe("RequesterDashboard", () => {
  it("shows the four cards linking into My Tickets, and the lists with reasons", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(requesterDashboard());
    renderWithAuth(<RequesterDashboard />, { user: REQUESTER_USER });
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome, Jennifer!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^My Open Tickets: 3/ })).toHaveAttribute("href", "/tickets?statusGroup=active");
    expect(screen.getByRole("link", { name: /^Waiting for Me: 1/ })).toHaveAttribute("href", "/tickets?currentStatus=WAITING_FOR_REQUESTER");
    expect(screen.getByRole("link", { name: /^Resolved: 1/ })).toHaveAttribute("href", "/tickets?currentStatus=RESOLVED");
    expect(screen.getByRole("link", { name: /^Closed: 12/ })).toHaveAttribute("href", "/tickets?currentStatus=CLOSED");

    const attention = screen.getByRole("region", { name: "Needs your attention" });
    expect(within(attention).getByText("Waiting for your reply")).toBeInTheDocument();
    expect(within(attention).getByText("Resolved — please check it works")).toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: "TKT-2026-000004" })).toHaveAttribute("href", "/tickets/TKT-2026-000004");
    expect(screen.getByRole("region", { name: "Recently resolved (last 7 days)" })).toHaveTextContent("TKT-2026-000005");
    expect(screen.getByRole("link", { name: "+ Create Ticket" })).toHaveAttribute("href", "/tickets/new");
  });

  // UI-04 (AC-20, AC-24)
  it("shows 0 and empty messages for a requester with nothing yet", async () => {
    const d = requesterDashboard({ needsAttention: [], recentlyUpdated: [], recentlyResolved: [] });
    for (const k of Object.keys(d.metrics) as (keyof typeof d.metrics)[]) d.metrics[k] = EMPTY_METRIC(d.metrics[k].query);
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(d);
    renderWithAuth(<RequesterDashboard />, { user: REQUESTER_USER });
    expect(await screen.findByRole("link", { name: /^My Open Tickets: 0/ })).toBeInTheDocument();
    expect(screen.getByText("Nothing needs your attention right now.")).toBeInTheDocument();
    expect(screen.getByText("You have no tickets yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing was resolved in the last week.")).toBeInTheDocument();
  });

  it("recovers from a failed load with Retry", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(requesterDashboard());
    const user = userEvent.setup();
    renderWithAuth(<RequesterDashboard />, { user: REQUESTER_USER });
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("requester-metrics")).toBeInTheDocument();
  });
});
