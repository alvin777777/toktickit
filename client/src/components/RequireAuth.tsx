import { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Role } from "../api.js";
import { ROLE_LABEL, roleHome, useAuth } from "../context/AuthContext.js";
import AppShell from "./AppShell.js";

interface Props {
  roles?: Role[]; // omit = any authenticated role
  children: ReactNode;
}

// Lab 3 Issue 2 — route guard (ui-spec.md §2, AC-02/AC-07/AC-09). This mirrors the server's
// requireAuth / requirePasswordChanged / requireRole guards for navigation only; the API enforces
// the real rules (FR-07).
export default function RequireAuth({ roles, children }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100" role="status">
        <span className="text-muted">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <AppShell>
        <Forbidden role={user.role} />
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}

// ui-spec.md §1.5 — forbidden card.
export function Forbidden({ role }: { role: Role }) {
  return (
    <div className="container py-5">
      <div className="card shadow-sm mx-auto text-center p-4" style={{ maxWidth: 480 }} data-testid="forbidden">
        <h1 className="h5 mb-2">You don't have access to this page</h1>
        <p className="text-muted small mb-3">
          Your account is signed in as <strong>{ROLE_LABEL[role]}</strong>, which does not include this screen.
        </p>
        <Link to={roleHome(role)} className="btn btn-success">
          Go to my home page
        </Link>
      </div>
    </div>
  );
}
