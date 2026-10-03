import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import RequireAuth from "../../src/components/RequireAuth.js";
import { REQUESTER_USER, STAFF_USER, renderWithAuth } from "../helpers/auth.js";

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // UI-09 (AC-07, FR-03) — no session → Login.
  it("redirects an unauthenticated visitor to /login", async () => {
    renderWithAuth(
      <RequireAuth>
        <div>My Tickets Page</div>
      </RequireAuth>,
      { user: null, route: "/tickets", path: "/tickets", extraRoutes: [{ path: "/login", element: <div>Login Page</div> }] }
    );
    expect(await screen.findByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("My Tickets Page")).not.toBeInTheDocument();
  });

  // UI-08 (AC-09) — wrong role → forbidden card, page never rendered.
  it.each([
    ["/staff/queue", "Ticket Queue Page"],
    ["/admin/users", "Users Page"],
  ])("shows the forbidden card to a Requester opening %s", async (route, body) => {
    renderWithAuth(
      <RequireAuth roles={["IT_STAFF", "ADMIN"]}>
        <div>{body}</div>
      </RequireAuth>,
      { user: REQUESTER_USER, route, path: route, extraRoutes: [{ path: "/tickets", element: <div>My Tickets Page</div> }] }
    );
    expect(await screen.findByTestId("forbidden")).toBeInTheDocument();
    expect(screen.getByText(/you don't have access to this page/i)).toBeInTheDocument();
    expect(screen.queryByText(body)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to my home page/i })).toHaveAttribute("href", "/tickets");
  });

  it("renders the page for a permitted role", async () => {
    renderWithAuth(
      <RequireAuth roles={["IT_STAFF", "ADMIN"]}>
        <div>Ticket Queue Page</div>
      </RequireAuth>,
      { user: STAFF_USER, route: "/staff/queue", path: "/staff/queue" }
    );
    expect(await screen.findByText("Ticket Queue Page")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("forbidden")).not.toBeInTheDocument());
  });

  it("shows a loading state until the session check settles", () => {
    renderWithAuth(
      <RequireAuth>
        <div>Page</div>
      </RequireAuth>,
      { user: REQUESTER_USER }
    );
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });
});
