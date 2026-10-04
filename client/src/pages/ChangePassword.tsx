import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, changePassword } from "../api.js";
import { roleHome, useAuth } from "../context/AuthContext.js";
import PasswordInput from "../components/PasswordInput.js";

// BR-05 — mirrored client-side for the live checklist; the server remains the authority.
const RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 && p.length <= 72 },
  { id: "case", label: "Upper and lower case letters", test: (p: string) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { id: "digit", label: "At least one number", test: (p: string) => /[0-9]/.test(p) },
];

// ui-spec.md §4 — Change Password (forced after first login, or voluntary from the shell).
export default function ChangePassword() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const forced = Boolean(user?.mustChangePassword);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError("");

    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = "Current password is required.";
    if (!RULES.every((r) => r.test(newPassword))) {
      errors.newPassword = "Password must be 8-72 characters and include an uppercase letter, a lowercase letter, and a number.";
    } else if (newPassword === currentPassword) {
      errors.newPassword = "New password must differ from the current password.";
    }
    if (confirmPassword !== newPassword) errors.confirmPassword = "Passwords do not match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const updated = await changePassword({ currentPassword, newPassword, confirmPassword });
      setUser(updated);
      navigate(roleHome(updated.role), { replace: true, state: { passwordUpdated: true } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(err.fields);
      } else {
        setApiError("Unable to change your password right now. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="d-flex justify-content-center py-5 px-3">
      <div className="card shadow-sm p-4" style={{ maxWidth: 480, width: "100%" }}>
        <h1 className="h5 mb-1">Change Your Password</h1>
        <p className="text-muted small mb-3">
          {forced ? "You must change your password to continue." : "Choose a new password."}
        </p>

        {apiError && (
          <div className="alert alert-danger py-2" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <PasswordInput
              id="current-password"
              label={forced ? "Current (initial) password" : "Current password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
              error={fieldErrors.currentPassword}
              disabled={submitting}
            />
          </div>
          <div className="mb-2">
            <PasswordInput
              id="new-password"
              label="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              error={fieldErrors.newPassword}
              disabled={submitting}
            />
          </div>
          <ul className="list-unstyled small mb-3" aria-label="Password rules">
            {RULES.map((rule) => {
              const ok = rule.test(newPassword);
              return (
                <li key={rule.id} className={ok ? "text-success" : "text-muted"} data-testid={`rule-${rule.id}`} data-ok={ok}>
                  {ok ? "✓" : "○"} {rule.label}
                </li>
              );
            })}
          </ul>
          <div className="mb-4">
            <PasswordInput
              id="confirm-password"
              label="Confirm new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              error={fieldErrors.confirmPassword}
              disabled={submitting}
            />
          </div>

          <div className="d-flex gap-2 justify-content-end flex-wrap">
            {forced ? (
              <button type="button" className="btn btn-outline-secondary" onClick={handleLogout} disabled={submitting}>
                Logout
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => navigate(roleHome(user!.role))}
                disabled={submitting}
              >
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn-success" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
