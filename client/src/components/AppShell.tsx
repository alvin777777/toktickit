import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ROLE_LABEL, useAuth } from "../context/AuthContext.js";
import { Role } from "../api.js";

// ui-spec.md §2 — Application Shell with role-specific navigation (FR-06).
const NAV_BY_ROLE: Record<Role, { to: string; label: string }[]> = {
  REQUESTER: [
    { to: "/tickets", label: "My Tickets" },
    { to: "/tickets/new", label: "Create Ticket" },
  ],
  IT_STAFF: [{ to: "/staff/queue", label: "Ticket Queue" }],
  ADMIN: [
    { to: "/staff/queue", label: "Ticket Queue" },
    { to: "/admin/users", label: "Users" },
  ],
};

// ui-spec.md §1.1 — role badge classes (shared with User Management).
export const ROLE_BADGE: Record<Role, string> = {
  REQUESTER: "bg-secondary",
  IT_STAFF: "text-success border border-success bg-white",
  ADMIN: "bg-success",
};

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  // While a password change is pending, the only way out of the Change Password screen is Logout.
  const navItems = user && !user.mustChangePassword ? NAV_BY_ROLE[user.role] : [];

  return (
    <div className="d-flex flex-column min-vh-100">
      <nav className="navbar navbar-expand-md navbar-dark" style={{ backgroundColor: "#006B3C" }}>
        <div className="container-fluid">
          <span className="navbar-brand fw-semibold">TokTickIT</span>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#appShellNav"
            aria-controls="appShellNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="appShellNav">
            <ul className="navbar-nav me-auto">
              {navItems.map((item) => (
                <li className="nav-item" key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/tickets"}
                    className={({ isActive }) => "nav-link" + (isActive ? " fw-bold text-white" : " text-white-50")}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            {user && (
              <div className="d-flex align-items-center text-white gap-2 flex-wrap" data-testid="current-user">
                <span>{user.name}</span>
                <span className={`badge ${ROLE_BADGE[user.role]}`}>{ROLE_LABEL[user.role]}</span>
                {!user.mustChangePassword && (
                  <Link to="/change-password" className="btn btn-sm btn-link text-white-50 text-decoration-none">
                    Change Password
                  </Link>
                )}
                <button className="btn btn-sm btn-outline-light" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="flex-grow-1" style={{ backgroundColor: "#F5F7F6" }}>
        {children}
      </main>
    </div>
  );
}
