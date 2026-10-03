import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "../../src/pages/Login.js";
import RequireAuth from "../../src/components/RequireAuth.js";
import * as api from "../../src/api.js";
import { ADMIN_USER, REQUESTER_USER, STAFF_USER, renderWithAuth } from "../helpers/auth.js";

function renderLogin() {
  return renderWithAuth(<Login />, {
    user: null,
    route: "/login",
    path: "/login",
    extraRoutes: [
      { path: "/tickets", element: <div>My Tickets Page</div> },
      { path: "/staff/queue", element: <div>Ticket Queue Page</div> },
      { path: "/admin/users", element: <div>Users Page</div> },
      { path: "/change-password", element: <div>Change Password Page</div> },
    ],
  });
}

async function signIn(user: ReturnType<typeof userEvent.setup>, email = "jennifer.anderson@toktickit.dev", password = "Password123!") {
  await user.type(screen.getByLabelText(/email address/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("Login", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // UI-01 (AC-01, FR-01) — each role lands on its own home.
  it.each([
    [REQUESTER_USER, "My Tickets Page"],
    [STAFF_USER, "Ticket Queue Page"],
    [ADMIN_USER, "Users Page"],
  ])("signs in and navigates to the role home (%o)", async (authUser, home) => {
    const loginSpy = vi.spyOn(api, "login").mockResolvedValue(authUser);
    const user = userEvent.setup();
    renderLogin();

    await signIn(user, authUser.email);

    expect(await screen.findByText(home)).toBeInTheDocument();
    expect(loginSpy).toHaveBeenCalledWith(authUser.email, "Password123!");
  });

  // UI-03 (FR-01) — empty fields never reach the API.
  it("shows field messages and makes no API call when fields are empty", async () => {
    const loginSpy = vi.spyOn(api, "login");
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/email address is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  // UI-02 (AC-05, AC-06, AC-33) — safe failure feedback per case.
  it("shows the safe invalid-credentials banner, keeps the email, clears the password", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new api.ApiError(401, { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" }));
    const user = userEvent.setup();
    renderLogin();

    await signIn(user, "jennifer.anderson@toktickit.dev", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(screen.getByLabelText(/email address/i)).toHaveValue("jennifer.anderson@toktickit.dev");
    expect(screen.getByLabelText(/^password/i)).toHaveValue("");
  });

  it("shows the inactive-account banner on 403 ACCOUNT_INACTIVE", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new api.ApiError(403, { error: "inactive", code: "ACCOUNT_INACTIVE" }));
    const user = userEvent.setup();
    renderLogin();

    await signIn(user, "former.employee@toktickit.dev");

    expect(await screen.findByRole("alert")).toHaveTextContent(/this account is inactive/i);
  });

  it("shows a busy state while signing in and a safe failure banner when the API is unreachable", async () => {
    let reject!: (err: Error) => void;
    vi.spyOn(api, "login").mockReturnValue(new Promise((_, rej) => (reject = rej)));
    const user = userEvent.setup();
    renderLogin();

    await signIn(user);
    expect(await screen.findByRole("button", { name: /signing in/i })).toBeDisabled();

    reject(new TypeError("Failed to fetch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to sign in right now/i);
    expect(screen.getByLabelText(/email address/i)).toHaveValue("jennifer.anderson@toktickit.dev");
  });

  // UI-04 (AC-02) — mustChangePassword users go to Change Password, from login and from any route.
  it("sends a user who must change their password to /change-password after login", async () => {
    vi.spyOn(api, "login").mockResolvedValue({ ...REQUESTER_USER, mustChangePassword: true });
    const user = userEvent.setup();
    renderLogin();

    await signIn(user);

    expect(await screen.findByText("Change Password Page")).toBeInTheDocument();
  });

  it("redirects a flagged user who opens a normal route directly to /change-password", async () => {
    renderWithAuth(
      <RequireAuth roles={["REQUESTER"]}>
        <div>My Tickets Page</div>
      </RequireAuth>,
      {
        user: { ...REQUESTER_USER, mustChangePassword: true },
        route: "/tickets",
        path: "/tickets",
        extraRoutes: [{ path: "/change-password", element: <div>Change Password Page</div> }],
      }
    );

    expect(await screen.findByText("Change Password Page")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("My Tickets Page")).not.toBeInTheDocument());
  });
});
