import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserManagement from "../../src/pages/UserManagement.js";
import RequireAuth from "../../src/components/RequireAuth.js";
import * as api from "../../src/api.js";
import { ADMIN_USER, STAFF_USER, renderWithAuth } from "../helpers/auth.js";

function user(overrides: Partial<api.AdminUser> = {}): api.AdminUser {
  return {
    id: 7,
    name: "Emily Davis",
    email: "emily.davis@toktickit.dev",
    role: "IT_STAFF",
    isActive: true,
    mustChangePassword: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}
const ADMIN_ROW = user({ id: ADMIN_USER.id, name: "John Smith", email: "john.smith@toktickit.dev", role: "ADMIN" });

function renderUsers() {
  return renderWithAuth(<UserManagement />, { user: ADMIN_USER, route: "/admin/users", path: "/admin/users" });
}

describe("UserManagement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // UI-18 (AC-22)
  it("lists users with Name, Email, Role, Status, Edit, and passes search / role filter to the API", async () => {
    const spy = vi.spyOn(api, "getUsers").mockResolvedValue([
      user(),
      ADMIN_ROW,
      user({ id: 9, name: "Robert Wilson", email: "robert.wilson@toktickit.dev", isActive: false, mustChangePassword: true }),
    ]);
    const u = userEvent.setup();
    renderUsers();

    const table = await screen.findByTestId("users-table");
    for (const header of ["Name", "Email", "Role", "Status"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(within(table).getByText("emily.davis@toktickit.dev")).toBeInTheDocument();
    expect(within(table).getByText("Administrator")).toBeInTheDocument();
    expect(within(table).getAllByText("Active")).toHaveLength(2);
    expect(within(table).getByText("Inactive")).toBeInTheDocument();
    expect(within(table).getByText(/password change pending/i)).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: /edit robert wilson/i })).toBeInTheDocument();

    await u.type(screen.getByLabelText(/search users/i), "rob");
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ search: "rob", role: undefined }));
    await u.selectOptions(screen.getByLabelText(/filter by role/i), "IT_STAFF");
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ search: "rob", role: "IT_STAFF" }));
  });

  // UI-19 (AC-23, AC-24)
  it("creates a user after validation, maps 409 EMAIL_TAKEN onto the email field, and appends the row", async () => {
    vi.spyOn(api, "getUsers").mockResolvedValue([ADMIN_ROW]);
    const created = user({ id: 20, name: "Alex Thompson", email: "alex.thompson@toktickit.dev", mustChangePassword: true });
    const createSpy = vi
      .spyOn(api, "createUser")
      .mockRejectedValueOnce(new api.ApiError(409, { error: "A user with this email already exists.", code: "EMAIL_TAKEN", fields: { email: "A user with this email already exists." } }))
      .mockResolvedValueOnce(created);
    const u = userEvent.setup();
    renderUsers();

    await u.click(await screen.findByRole("button", { name: /create user/i }));
    const panel = screen.getByTestId("user-panel");
    await u.click(within(panel).getByRole("button", { name: /save user/i }));
    expect(await within(panel).findByText(/name must be 2-100 characters/i)).toBeInTheDocument();
    expect(within(panel).getByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(within(panel).getByText(/must be 8-72 characters/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    await u.type(within(panel).getByLabelText(/full name/i), "Alex Thompson");
    await u.type(within(panel).getByLabelText(/email address/i), "alex.thompson@toktickit.dev");
    await u.selectOptions(within(panel).getByLabelText(/^role/i), "IT_STAFF");
    await u.type(within(panel).getByLabelText(/initial password/i), "Welcome123!");
    await u.click(within(panel).getByRole("button", { name: /save user/i }));
    expect(await within(panel).findByText(/already exists/i)).toBeInTheDocument(); // 409 on the email field

    await u.click(within(panel).getByRole("button", { name: /save user/i }));
    await waitFor(() =>
      expect(createSpy).toHaveBeenLastCalledWith({ name: "Alex Thompson", email: "alex.thompson@toktickit.dev", role: "IT_STAFF", isActive: true, initialPassword: "Welcome123!" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/alex thompson created/i);
    expect(within(screen.getByTestId("users-table")).getByText("alex.thompson@toktickit.dev")).toBeInTheDocument();
    expect(screen.queryByTestId("user-panel")).not.toBeInTheDocument();
  });

  // UI-20 (AC-25, AC-26, AC-27)
  it("edits a user, sets an initial password after confirmation, and locks self-deactivation", async () => {
    vi.spyOn(api, "getUsers").mockResolvedValue([user(), ADMIN_ROW]);
    const updateSpy = vi.spyOn(api, "updateUser").mockResolvedValue(user({ name: "Emily D.", role: "ADMIN" }));
    const resetSpy = vi.spyOn(api, "setInitialPassword").mockResolvedValue(user({ mustChangePassword: true }));
    const u = userEvent.setup();
    renderUsers();

    await u.click(await screen.findByRole("button", { name: /edit emily davis/i }));
    let panel = screen.getByTestId("user-panel");
    const nameField = within(panel).getByLabelText(/full name/i);
    await u.clear(nameField);
    await u.type(nameField, "Emily D.");
    await u.selectOptions(within(panel).getByLabelText(/^role/i), "ADMIN");
    await u.click(within(panel).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(7, { name: "Emily D.", email: "emily.davis@toktickit.dev", role: "ADMIN", isActive: true }));
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);

    // Reopen and set an initial password (confirmation required).
    await u.click(screen.getByRole("button", { name: /edit emily d\./i }));
    panel = screen.getByTestId("user-panel");
    await u.type(within(panel).getByLabelText(/new initial password/i), "Temporary456");
    await u.click(within(panel).getByRole("button", { name: /set password/i }));
    expect(resetSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/set a new initial password/i);
    await u.click(screen.getByRole("button", { name: /yes, set password/i }));
    await waitFor(() => expect(resetSpy).toHaveBeenCalledWith(7, "Temporary456"));
    expect(await screen.findByRole("status")).toHaveTextContent(/signed out and must change it/i);

    // Editing yourself: the Active switch is disabled with the explanation.
    await u.click(screen.getByRole("button", { name: /edit john smith/i }));
    panel = screen.getByTestId("user-panel");
    expect(within(panel).getByLabelText(/active/i)).toBeDisabled();
    expect(within(panel).getByText(/you cannot deactivate your own account/i)).toBeInTheDocument();
  });

  it("shows a 409 LAST_ADMIN conflict from the API as an inline alert", async () => {
    vi.spyOn(api, "getUsers").mockResolvedValue([user({ id: 30, name: "Second Admin", email: "second@toktickit.dev", role: "ADMIN" }), ADMIN_ROW]);
    vi.spyOn(api, "updateUser").mockRejectedValue(new api.ApiError(409, { error: "At least one active Administrator is required.", code: "LAST_ADMIN" }));
    const u = userEvent.setup();
    renderUsers();

    await u.click(await screen.findByRole("button", { name: /edit second admin/i }));
    const panel = screen.getByTestId("user-panel");
    await u.click(within(panel).getByLabelText(/active/i)); // two active admins → switch enabled
    await u.click(within(panel).getByRole("button", { name: /save changes/i }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(/at least one active administrator is required/i);
  });

  // UI-21 (AC-29, AC-33)
  it("shows the forbidden card to IT Staff", async () => {
    const spy = vi.spyOn(api, "getUsers");
    renderWithAuth(
      <RequireAuth roles={["ADMIN"]}>
        <UserManagement />
      </RequireAuth>,
      { user: STAFF_USER, route: "/admin/users", path: "/admin/users", extraRoutes: [{ path: "/staff/queue", element: <div>Queue</div> }] }
    );
    expect(await screen.findByTestId("forbidden")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows a failure banner with Retry when the list cannot load", async () => {
    const spy = vi.spyOn(api, "getUsers").mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue([ADMIN_ROW]);
    const u = userEvent.setup();
    renderUsers();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load users/i);
    await u.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByTestId("users-table")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
