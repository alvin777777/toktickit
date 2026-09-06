import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Category, TicketListItem, getCategories, getMyTickets } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";

type LoadState = "loading" | "success" | "error";
type SortField = "createdAt" | "requestedPriority" | "currentStatus";

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-secondary",
  MEDIUM: "bg-warning text-dark",
  HIGH: "bg-danger",
};

// ui-spec.md §5.4 — My Tickets screen.
export default function MyTickets() {
  const { requester } = useRequester();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  // Guards against out-of-order responses: a slow request for an earlier search term must never
  // overwrite the result of a newer one (AC-11). Bumped at the start of every load() call.
  const requestIdRef = useRef(0);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtersActive = Boolean(search || categoryId || requestedPriority || currentStatus);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {
        /* category names are a nice-to-have in the filter row; the list itself still works */
      });
  }, []);

  useEffect(() => {
    if (!requester) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requester, search, categoryId, requestedPriority, currentStatus, sortBy, sortDir, page]);

  async function load() {
    if (!requester) return;
    const requestId = ++requestIdRef.current;
    setLoadState("loading");
    try {
      const result = await getMyTickets(requester.id, {
        search,
        categoryId: categoryId ? Number(categoryId) : undefined,
        requestedPriority: requestedPriority || undefined,
        currentStatus: currentStatus || undefined,
        sortBy,
        sortDir,
        page,
      });
      if (requestId !== requestIdRef.current) return; // a newer request has since started
      setItems(result.items);
      setPageSize(result.pageSize);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
      setLoadState("success");
    } catch {
      if (requestId !== requestIdRef.current) return;
      setLoadState("error");
    }
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setCategoryId("");
    setRequestedPriority("");
    setCurrentStatus("");
    setPage(1);
  }

  function categoryName(id: number) {
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

  const showEmpty = loadState === "success" && totalItems === 0 && !filtersActive;
  const showNoResults = loadState === "success" && totalItems === 0 && filtersActive;
  const showList = loadState === "success" && totalItems > 0;

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 className="h4 mb-1">My Tickets</h1>
          <p className="text-muted small mb-0">View and track all of your support requests.</p>
        </div>
        <Link to="/tickets/new" className="btn btn-success">
          + Create Ticket
        </Link>
      </div>

      {!showEmpty && (
        <div className="row g-2 mb-3">
          <div className="col-md-4">
            <input
              type="search"
              className="form-control"
              placeholder="Search by ticket number or summary…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search tickets"
            />
          </div>
          <div className="col-md-3">
            <select
              className="form-select"
              aria-label="Filter by category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <select
              className="form-select"
              aria-label="Filter by requested priority"
              value={requestedPriority}
              onChange={(e) => {
                setRequestedPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="col-md-2">
            <select
              className="form-select"
              aria-label="Filter by status"
              value={currentStatus}
              onChange={(e) => {
                setCurrentStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="NEW">New</option>
            </select>
          </div>
          <div className="col-md-1">
            <button className="btn btn-outline-secondary w-100" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>
      )}

      {loadState === "loading" && (
        <div role="status" className="text-center text-muted py-5">
          Loading tickets…
        </div>
      )}

      {loadState === "error" && (
        <div className="alert alert-danger" role="alert">
          Unable to load tickets. Please try again.
          <div className="mt-2">
            <button className="btn btn-sm btn-outline-danger" onClick={load}>
              Retry
            </button>
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="text-center py-5">
          <p className="text-muted mb-3">You haven't created any tickets yet.</p>
          <Link to="/tickets/new" className="btn btn-success">
            Create Ticket
          </Link>
        </div>
      )}

      {showNoResults && (
        <div className="text-center py-5">
          <p className="text-muted mb-3">No tickets match your filters.</p>
          <button className="btn btn-outline-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {showList && (
        <>
          <div className="table-responsive d-none d-md-block">
            <table className="table">
              <thead>
                <tr>
                  <th role="button" onClick={() => toggleSort("createdAt")}>
                    Ticket No.
                  </th>
                  <th role="button" onClick={() => toggleSort("createdAt")}>
                    Created Date {sortBy === "createdAt" && (sortDir === "asc" ? "▲" : "▼")}
                  </th>
                  <th>Summary</th>
                  <th>Category</th>
                  <th role="button" onClick={() => toggleSort("requestedPriority")}>
                    Requested Priority {sortBy === "requestedPriority" && (sortDir === "asc" ? "▲" : "▼")}
                  </th>
                  <th role="button" onClick={() => toggleSort("currentStatus")}>
                    Current Status {sortBy === "currentStatus" && (sortDir === "asc" ? "▲" : "▼")}
                  </th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td>{t.ticketNumber}</td>
                    <td>{new Date(t.createdAt).toLocaleString()}</td>
                    <td>{t.summary}</td>
                    <td>{categoryName(t.categoryId)}</td>
                    <td>
                      <span className={`badge ${PRIORITY_BADGE[t.requestedPriority]}`}>{t.requestedPriority}</span>
                    </td>
                    <td>
                      <span className="badge bg-info text-dark">{t.currentStatus}</span>
                    </td>
                    <td>{new Date(t.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout (ui-spec.md §5.4) */}
          <div className="d-md-none">
            {items.map((t) => (
              <div key={t.id} className="card mb-2">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <strong>{t.ticketNumber}</strong>
                    <span className={`badge ${PRIORITY_BADGE[t.requestedPriority]}`}>{t.requestedPriority}</span>
                  </div>
                  <div>{t.summary}</div>
                  <div className="text-muted small">{categoryName(t.categoryId)}</div>
                  <div className="text-muted small">{new Date(t.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
            <span className="text-muted small">
              Showing {(page - 1) * pageSize + 1} to {(page - 1) * pageSize + items.length} of {totalItems} tickets
            </span>
            <div className="btn-group">
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span className="btn btn-sm disabled">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
