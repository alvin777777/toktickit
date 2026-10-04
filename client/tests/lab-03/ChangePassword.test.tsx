import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangePassword from "../../src/pages/ChangePassword.js";
import * as api from "../../src/api.js";
import { REQUESTER_USER, renderWithAuth } from "../helpers/auth.js";

function renderChangePassword(forced = true) {
  return renderWithAuth(<ChangePassword />, {
    user: { ...REQUESTER_USER, mustChangePassword: forced },
    route: "/change-password",
    path: "/change-password",
    extraRoutes: [{ path: "/tickets", element: <div>My Tickets Page</div> }],
  });
}

describe("ChangePassword", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // UI-05 (AC-08, BR-05) — live checklist + client validation + API field mapping.
  it("ticks the rule checklist as the new password satisfies each rule", async () => {
    const user = userEvent.setup();
    renderChangePassword();

    const newPassword = await screen.findByLabelText(/^new password/i);
    await user.type(newPassword, "abc");
    expect(screen.getByTestId("rule-length")).toHaveAttribute("data-ok", "false");
    expect(screen.getByTestId("rule-case")).toHaveAttribute("data-ok", "false");
    expect(screen.getByTestId("rule-digit")).toHaveAttribute("data-ok", "false");

    await user.clear(newPassword);
    await user.type(newPassword, "Stronger123");
    expect(screen.getByTestId("rule-length")).toHaveAttribute("data-ok", "true");
    expect(screen.getByTestId("rule-case")).toHaveAttribute("data-ok", "true");
    expect(screen.getByTestId("rule-digit")).toHaveAttribute("data-ok", "true");
  });

  it("shows field messages for a weak password and a mismatched confirmation without calling the API", async () => {
    const spy = vi.spyOn(api, "changePassword");
    const user = userEvent.setup();
    renderChangePassword();

    await user.type(await screen.findByLabelText(/current/i), "Welcome123!");
    await user.type(screen.getByLabelText(/^new password/i), "weak");
    await user.type(screen.getByLabelText(/confirm new password/i), "different");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/must be 8-72 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps a 400 from the API (wrong current password) onto the field", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(
      new api.ApiError(400, { error: "Invalid password change", fields: { currentPassword: "Current password is incorrect." } })
    );
    const user = userEvent.setup();
    renderChangePassword();

    await user.type(await screen.findByLabelText(/current/i), "Nope12345");
    await user.type(screen.getByLabelText(/^new password/i), "Stronger123");
    await user.type(screen.getByLabelText(/confirm new password/i), "Stronger123");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });

  // UI-06 (AC-02) — forced change succeeds → role home, flag cleared.
  it("navigates to the role home after a successful forced change", async () => {
    const spy = vi
      .spyOn(api, "changePassword")
      .mockResolvedValue({ ...REQUESTER_USER, mustChangePassword: false });
    const user = userEvent.setup();
    renderChangePassword();

    expect(await screen.findByText(/you must change your password to continue/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument(); // forced: no Cancel
    await user.type(screen.getByLabelText(/current/i), "Welcome123!");
    await user.type(screen.getByLabelText(/^new password/i), "Stronger123");
    await user.type(screen.getByLabelText(/confirm new password/i), "Stronger123");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("My Tickets Page")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith({ currentPassword: "Welcome123!", newPassword: "Stronger123", confirmPassword: "Stronger123" });
  });

  it("offers Cancel for a voluntary change and shows a safe failure banner on API error", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderChangePassword(false);

    expect(await screen.findByRole("button", { name: /cancel/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/current/i), "Password123!");
    await user.type(screen.getByLabelText(/^new password/i), "Stronger123");
    await user.type(screen.getByLabelText(/confirm new password/i), "Stronger123");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unable to change your password/i));
    expect(screen.getByLabelText(/^new password/i)).toHaveValue("Stronger123"); // values kept
  });
});
