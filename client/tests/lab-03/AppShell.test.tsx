import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppShell from "../../src/components/AppShell.js";
import * as api from "../../src/api.js";
import { ADMIN_USER, REQUESTER_USER, STAFF_USER, renderWithAuth } from "../helpers/auth.js";

function renderShell(user: api.AuthUser) {
  return renderWithAuth(
    <AppShell>
      <div>Page Body</div>
    </AppShell>,
    { user, route: "/", path: "/", extraRoutes: [{ path: "/login", element: <div>Login Page</div> }] }
  );
}

// UI-07 (FR-06, AC-07) — name + role badge + role-specific navigation + Logout.
describe("AppShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the Requester's name, role badge, and only Requester navigation", async () => {
    renderShell(REQUESTER_USER);
    expect(await screen.findByText("Jennifer Anderson")).toBeInTheDocument();
    expect(screen.getByText("Requester")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ticket Queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("shows IT Staff only the Ticket Queue", async () => {
    renderShell(STAFF_USER);
    expect(await screen.findByText("Emily Davis")).toBeInTheDocument();
    expect(screen.getByText("IT Staff")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ticket Queue" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("shows the Administrator the Ticket Queue and Users", async () => {
    renderShell(ADMIN_USER);
    expect(await screen.findByText("Administrator")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ticket Queue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create Ticket" })).not.toBeInTheDocument();
  });

  it("calls the logout API and returns to the Login screen", async () => {
    const logoutSpy = vi.spyOn(api, "logout").mockResolvedValue();
    const user = userEvent.setup();
    renderShell(REQUESTER_USER);

    await user.click(await screen.findByRole("button", { name: /logout/i }));

    expect(await screen.findByText("Login Page")).toBeInTheDocument();
    await waitFor(() => expect(logoutSpy).toHaveBeenCalledTimes(1));
  });

  it("hides navigation and Change Password while a password change is pending", async () => {
    renderShell({ ...REQUESTER_USER, mustChangePassword: true });
    expect(await screen.findByText("Jennifer Anderson")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /change password/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });
});
