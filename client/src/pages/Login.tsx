import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api.js";
import { roleHome, useAuth } from "../context/AuthContext.js";
import PasswordInput from "../components/PasswordInput.js";

type Banner = { kind: "danger" | "warning"; text: string } | null;

// ui-spec.md §3 — Login screen (FR-01, AC-01/AC-05/AC-06/AC-33).
export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    // An already-authenticated user has nothing to do here (ui-spec.md §3).
    return <Navigate to={user.mustChangePassword ? "/change-password" : roleHome(user.role)} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);

    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Email address is required.";
    if (!password) errors.password = "Password is required.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      navigate(signedIn.mustChangePassword ? "/change-password" : roleHome(signedIn.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setBanner({ kind: "danger", text: "Invalid email or password. Please try again." });
        setPassword("");
      } else if (err instanceof ApiError && err.code === "ACCOUNT_INACTIVE") {
        setBanner({ kind: "warning", text: "This account is inactive. Contact an administrator." });
      } else if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(err.fields);
      } else {
        setBanner({ kind: "danger", text: "Unable to sign in right now. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center min-vh-100 px-3" style={{ backgroundColor: "#F5F7F6" }}>
      <div className="card shadow-sm p-4" style={{ maxWidth: 420, width: "100%" }}>
        <div className="text-center mb-3">
          <div className="fw-semibold" style={{ color: "#006B3C", fontSize: "1.25rem" }}>
            TokTickIT
          </div>
          <h1 className="h5 mb-1">Sign in to your account</h1>
          <p className="text-muted small mb-0">IT service desk for requesters, IT staff, and administrators.</p>
        </div>

        {banner && (
          <div className={`alert alert-${banner.kind} py-2`} role="alert">
            {banner.text}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="login-email" className="form-label fw-semibold">
              Email address <span className="text-danger">*</span>
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              autoFocus
              className={"form-control" + (fieldErrors.email ? " is-invalid" : "")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
            {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
          </div>

          <div className="mb-4">
            <PasswordInput
              id="login-password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              error={fieldErrors.password}
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn btn-success w-100" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
