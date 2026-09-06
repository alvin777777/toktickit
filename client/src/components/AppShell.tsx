import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";

// ui-spec.md §5.1 — Application Shell.
export default function AppShell({ children }: { children: ReactNode }) {
  const { requester, clearRequester } = useRequester();
  const navigate = useNavigate();

  function handleChangeRequester() {
    clearRequester();
    navigate("/select");
  }

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
              <li className="nav-item">
                <NavLink
                  to="/tickets"
                  className={({ isActive }) => "nav-link" + (isActive ? " fw-bold text-white" : " text-white-50")}
                >
                  My Tickets
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink
                  to="/tickets/new"
                  className={({ isActive }) => "nav-link" + (isActive ? " fw-bold text-white" : " text-white-50")}
                >
                  Create Ticket
                </NavLink>
              </li>
            </ul>
            {requester && (
              <div className="d-flex align-items-center text-white gap-2">
                <span>{requester.name}</span>
                <button className="btn btn-sm btn-outline-light" onClick={handleChangeRequester}>
                  Change Requester
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
