import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getActiveRequesters, Requester } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";

type LoadState = "loading" | "loaded" | "empty" | "error";

// ui-spec.md §5.2 — Development Requester Selection screen. This is a Lab 2 testing
// mechanism only; it is explicitly NOT a login screen (BR-03).
export default function RequesterSelect() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const { selectRequester } = useRequester();
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoadState("loading");
    try {
      const active = await getActiveRequesters();
      setRequesters(active);
      setLoadState(active.length === 0 ? "empty" : "loaded");
    } catch {
      setLoadState("error");
    }
  }

  function handleContinue() {
    const chosen = requesters.find((r) => r.id === selectedId);
    if (!chosen) return;
    selectRequester(chosen);
    navigate("/tickets");
  }

  return (
    <div className="d-flex justify-content-center align-items-center min-vh-100" style={{ backgroundColor: "#F5F7F6" }}>
      <div className="card shadow-sm p-4" style={{ maxWidth: 480, width: "100%" }}>
        <div className="text-center mb-3">
          <div
            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-2"
            style={{ width: 56, height: 56, backgroundColor: "#EAF6EF" }}
          >
            🧑‍💻
          </div>
          <h1 className="h5 mb-1">Select Development Requester</h1>
          <p className="text-muted small mb-0">
            Select a Development Requester to test requester-specific ticket behavior. This is not
            a login screen. Authentication and role-based access will be introduced in Lab 3.
          </p>
        </div>

        {loadState === "loading" && (
          <div role="status" className="text-center text-muted py-3">
            Loading development requesters…
          </div>
        )}

        {loadState === "error" && (
          <div className="alert alert-danger" role="alert">
            Unable to load development requesters. Please try again.
            <div className="mt-2">
              <button className="btn btn-sm btn-outline-danger" onClick={load}>
                Retry
              </button>
            </div>
          </div>
        )}

        {loadState === "empty" && (
          <div className="alert alert-warning" role="alert">
            No active development requesters were found. Contact an administrator.
          </div>
        )}

        {loadState === "loaded" && (
          <>
            <label htmlFor="requester-select" className="form-label fw-semibold">
              Development Requester <span className="text-danger">*</span>
            </label>
            <select
              id="requester-select"
              className="form-select mb-3"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="" disabled>
                Choose a requester…
              </option>
              {requesters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <div className="alert p-2 small mb-3" style={{ backgroundColor: "#EAF6EF", color: "#1B2B24" }}>
              Only active development requesters are shown.
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary" disabled>
                Cancel
              </button>
              <button className="btn btn-success" disabled={!selectedId} onClick={handleContinue}>
                Continue →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
