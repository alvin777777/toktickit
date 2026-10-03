import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Assignee, Category, QueueItem, getAssignees, getCategories, getStaffQueue } from "../api.js";
import { ALL_STATUSES, PRIORITY_BADGE, STATUS_LABEL, StatusBadge } from "../components/badges.js";

type LoadState = "loading" | "success" | "error";
type SortField = "ticketNumber" | "createdAt" | "itPriority" | "currentStatus";

// ui-spec.md §6 — IT Staff Ticket Queue (FR-13, AC-13/AC-14).
export default function StaffTicketQueue() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [counts, setCounts] = useState({ all: 0, unassigned: 0, mine: 0 });
  const requestIdRef = useRef(0); // stale-response guard, same as My Tickets

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [itPriority, setItPriority] = useState("");
  const [owner, setOwner] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtersActive = Boolean(search || status || itPriority || owner || categoryId);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getAssignees().then(setAssignees).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, itPriority, owner, categoryId, sortBy, sortDir, page]);

  async function load() {
    const requestId = ++requestIdRef.current;
    setLoadState("loading");
    try {
      const result = await getStaffQueue({
        search,
        status: status || undefined,
        itPriority: itPriority || undefined,
        owner: owner || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        sortBy,
        sortDir,
        page,
      });
      if (requestId !== requestIdRef.current) return;
      setItems(result.items);
      setPageSize(result.pageSize);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
      setCounts(result.counts);
      setLoadState("success");
    } catch {
      if (requestId !== requestIdRef.current) return;
      setLoadState("error");
    }
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    setItPriority("");
    setOwner("");
    setCategoryId("");
    setPage(1);
  }

  function setOwnerChip(value: string) {
    setOwner(value);
    setPage(1);
  }

  const caret = (field: SortField) => (sortBy === field ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const showEmpty = loadState === "success" && counts.all === 0;
  const showNoResults = loadState === "success" && counts.all > 0 && totalItems === 0;
  const showList = loadState === "success" && totalItems > 0;

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1200 }}>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Ticket Queue</h1>
          <p className="text-muted small mb-0">Find, claim, and work tickets from every requester.</p>
        </div>
        <div className="btn-group" role="group" aria-label="Quick owner filters" data-testid="queue-counts">
          <button className={`btn btn-sm ${owner === "" ? "btn-success" : "btn-outline-success"}`} onClick={() => setOwnerChip("")}>
            All <span className="badge bg-light text-dark ms-1">{counts.all}</span>
          </button>
          <button
            className={`btn btn-sm ${owner === "unassigned" ? "btn-success" : "btn-outline-success"}`}
            onClick={() => setOwnerChip("unassigned")}
          >
            Unassigned <span className="badge bg-light text-dark ms-1">{counts.unassigned}</span>
          </button>
          <button className={`btn btn-sm ${owner === "me" ? "btn-success" : "btn-outline-success"}`} onClick={() => setOwnerChip("me")}>
            Mine <span className="badge bg-light text-dark ms-1">{counts.mine}</span>
          </button>
        </div>
      </div>

      {!showEmpty && (
        <div className="row g-2 mb-3">
          <div className="col-12 col-lg-3">
            <input
              type="search"
              className="form-control"
              placeholder="Search by ticket number, summary, or requester…"
              aria-label="Search queue"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="col-6 col-lg-2">
            <select
              className="form-select"
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-lg-2">
            <select
              className="form-select"
              aria-label="Filter by IT priority"
              value={itPriority}
              onChange={(e) => {
                setItPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All IT Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="col-6 col-lg-2">
            <select
              className="form-select"
              aria-label="Filter by owner"
              value={owner}
              onChange={(e) => {
                setOwner(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Owners</option>
              <option value="unassigned">Unassigned</option>
              <option value="me">Mine</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-lg-2">
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
          <div className="col-12 col-lg-1">
            <button className="btn btn-outline-secondary w-100" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>
      )}

      {loadState === "loading" && (
        <div role="status" className="placeholder-glow py-3" aria-label="Loading tickets">
          {[0, 1, 2].map((i) => (
            <span key={i} className="placeholder col-12 mb-2" style={{ height: 40, display: "block", borderRadius: 4 }} />
          ))}
          <span className="visually-hidden">Loading tickets…</span>
        </div>
      )}

      {loadState === "error" && (
        <div className="alert alert-danger" role="alert">
          Unable to load the ticket queue. Please try again.
          <div className="mt-2">
            <button className="btn btn-sm btn-outline-danger" onClick={load}>
              Retry
            </button>
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="text-center py-5 text-muted" data-testid="queue-empty">
          No tickets yet. New requests will appear here as soon as requesters submit them.
        </div>
      )}

      {showNoResults && (
        <div className="text-center py-5" data-testid="queue-no-results">
          <p className="text-muted mb-3">No tickets match your filters.</p>
          <button className="btn btn-outline-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {showList && (
        <>
          <div className="table-responsive d-none d-lg-block" data-testid="queue-table">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button" className="btn btn-link p-0 fw-semibold text-decoration-none text-reset" onClick={() => toggleSort("ticketNumber")}>
                      Ticket No.{caret("ticketNumber")}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="btn btn-link p-0 fw-semibold text-decoration-none text-reset" onClick={() => toggleSort("createdAt")}>
                      Created{caret("createdAt")}
                    </button>
                  </th>
                  <th>Summary</th>
                  <th>Requester</th>
                  <th>Category</th>
                  <th>Req. Priority</th>
                  <th scope="col">
                    <button type="button" className="btn btn-link p-0 fw-semibold text-decoration-none text-reset" onClick={() => toggleSort("itPriority")}>
                      IT Priority{caret("itPriority")}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="btn btn-link p-0 fw-semibold text-decoration-none text-reset" onClick={() => toggleSort("currentStatus")}>
                      Status{caret("currentStatus")}
                    </button>
                  </th>
                  <th>Owner</th>
                  <th>
                    <span className="visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/staff/tickets/${t.ticketNumber}`)}>
                    <td className="text-nowrap">{t.ticketNumber}</td>
                    <td className="text-nowrap">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="text-truncate" style={{ maxWidth: 260 }} title={t.summary}>
                      {t.summary}
                    </td>
                    <td>{t.requester.name}</td>
                    <td>{t.category.name}</td>
                    <td>
                      <span className={`badge ${PRIORITY_BADGE[t.requestedPriority]}`}>{t.requestedPriority}</span>
                    </td>
                    <td>
                      <span className={`badge ${PRIORITY_BADGE[t.itPriority]}`}>{t.itPriority}</span>
                    </td>
                    <td>
                      <StatusBadge status={t.currentStatus} />
                      {t.requesterResolvedAt && (
                        <span className="badge bg-light text-success border ms-1" title="Requester says resolved">
                          ✓ Requester says resolved
                        </span>
                      )}
                    </td>
                    <td>{t.owner ? t.owner.name : <span className="text-muted">Unassigned</span>}</td>
                    <td>
                      <Link to={`/staff/tickets/${t.ticketNumber}`} className="small" onClick={(e) => e.stopPropagation()}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Card layout below lg (ui-spec.md §6) */}
          <div className="d-lg-none" data-testid="queue-cards">
            {items.map((t) => (
              <div key={t.id} className="card mb-2" role="button" onClick={() => navigate(`/staff/tickets/${t.ticketNumber}`)}>
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <strong>{t.ticketNumber}</strong>
                    <StatusBadge status={t.currentStatus} />
                  </div>
                  <div>{t.summary}</div>
                  <div className="text-muted small">
                    {t.requester.name} · {t.category.name}
                  </div>
                  <div className="d-flex gap-1 my-1 flex-wrap">
                    <span className={`badge ${PRIORITY_BADGE[t.requestedPriority]}`}>Req: {t.requestedPriority}</span>
                    <span className={`badge ${PRIORITY_BADGE[t.itPriority]}`}>IT: {t.itPriority}</span>
                    {t.requesterResolvedAt && <span className="badge bg-light text-success border">✓ Requester says resolved</span>}
                  </div>
                  <div className="text-muted small">
                    {t.owner ? t.owner.name : "Unassigned"} · {new Date(t.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
            <span className="text-muted small">
              Showing {(page - 1) * pageSize + 1} to {(page - 1) * pageSize + items.length} of {totalItems} tickets
            </span>
            <div className="btn-group">
              <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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

      {filtersActive && showList && (
        <p className="text-muted small mt-2 mb-0">Filters applied — showing {totalItems} of {counts.all} tickets.</p>
      )}
    </div>
  );
}
