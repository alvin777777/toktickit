import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Priority, StaffDashboardData, StaffMetricKey, TicketStatus, getStaffDashboard } from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { ALL_STATUSES, ActionStatusBadge, PRIORITY_LABEL, STATUS_LABEL } from "../components/badges.js";
import { DashboardError, DashboardLoading, MetricCard, Panel, TicketRows, drillDown, firstName } from "../components/DashboardParts.js";

// docs/lab-04/ui-spec.md §4 — IT Staff / Administrator Dashboard (FR-12, FR-13, BR-29, BR-30).
const CARDS: { key: StaffMetricKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "inProgress", label: "In Progress" },
  { key: "waitingForRequester", label: "Waiting for Requester" },
  { key: "reopened", label: "Reopened" },
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "My Assigned" },
  { key: "highPriority", label: "High IT Priority" },
  { key: "appearsResolved", label: "Appears Resolved" },
  { key: "myOpenActions", label: "My Open Actions" },
];
const PRIORITIES: Priority[] = ["HIGH", "MEDIUM", "LOW"];

function Breakdown({ rows }: { rows: { label: string; value: number; to: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="list-unstyled mb-0 p-3 small">
      {rows.map((r) => (
        <li key={r.label} className="mb-2">
          <Link to={r.to} className="d-flex justify-content-between text-decoration-none" style={{ color: "#1B2B24" }}>
            <span>{r.label}</span>
            <span className="fw-semibold">{r.value}</span>
          </Link>
          <div className="rounded" style={{ height: 4, background: "#E7EFEA" }} aria-hidden="true">
            <div className="rounded" style={{ height: 4, width: `${(r.value / max) * 100}%`, background: "#0B7A46" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");

  async function load() {
    setState("loading");
    try {
      setData(await getStaffDashboard());
      setState("success");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const detail = (tn: string) => `/staff/tickets/${encodeURIComponent(tn)}`;
  const queue = (query: Record<string, string>) => drillDown("/staff/queue", query)!;

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1320 }}>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Welcome back, {firstName(user?.name)}!</h1>
          <p className="text-muted small mb-0">Here's what's happening with the service desk today.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load} disabled={state === "loading"}>
          ↻ Refresh
        </button>
      </div>

      {state === "loading" && !data && <DashboardLoading />}
      {state === "error" && <DashboardError onRetry={load} />}
      {data && state !== "error" && (
        <>
          <div className="row row-cols-2 row-cols-md-3 row-cols-xl-5 g-3 mb-4" data-testid="staff-metrics">
            {CARDS.map(({ key, label }) => {
              const m = data.metrics[key];
              return (
                <div key={key} className="col">
                  <MetricCard
                    label={label}
                    value={m.value}
                    to={drillDown("/staff/queue", m.query) ?? "#my-open-actions"}
                    hint={m.query ? "View tickets" : "See list below"}
                  />
                </div>
              );
            })}
            {data.userCounts && (
              <div className="col">
                <Link
                  to="/admin/users"
                  className="card h-100 text-decoration-none"
                  style={{ border: "1px solid #DDE5E0" }}
                  aria-label={`User accounts: ${data.userCounts.requesters} requesters, ${data.userCounts.itStaff} IT staff, ${data.userCounts.administrators} administrators active, ${data.userCounts.inactive} inactive. Manage users`}
                  data-testid="user-counts"
                >
                  <div className="card-body p-3 small" style={{ color: "#1B2B24" }}>
                    <span className="text-muted d-block mb-1">User accounts (active)</span>
                    <div>Requesters <strong>{data.userCounts.requesters}</strong></div>
                    <div>IT Staff <strong>{data.userCounts.itStaff}</strong></div>
                    <div>Administrators <strong>{data.userCounts.administrators}</strong></div>
                    <div className="text-muted">Inactive {data.userCounts.inactive}</div>
                    <span style={{ color: "#006B3C" }}>Manage users →</span>
                  </div>
                </Link>
              </div>
            )}
          </div>

          <div className="row g-3">
            <div className="col-lg-8">
              <Panel id="my-open-actions-heading" title="My Open Actions">
                {data.myOpenActions.length === 0 ? (
                  <p className="text-muted small m-3">You have no planned or in-progress actions.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {data.myOpenActions.map((a) => (
                      <li key={a.id} className="list-group-item d-flex flex-wrap align-items-center gap-2">
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <Link to={`${detail(a.ticketNumber)}?tab=actions`} className="fw-semibold small" style={{ color: "#006B3C" }}>
                            {a.ticketNumber}
                          </Link>
                          <span className="small text-muted"> · {a.ticketSummary}</span>
                          <div className="small text-truncate" title={a.description}>
                            {a.description}
                          </div>
                        </div>
                        <ActionStatusBadge status={a.status} />
                        <time className="small text-muted text-nowrap" dateTime={a.actionAt}>
                          {new Date(a.actionAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel id="urgent-heading" title="Urgent — High IT priority" action={<Link to={queue({ statusGroup: "active", itPriority: "HIGH" })} className="small">View all</Link>}>
                <TicketRows items={data.urgent} hrefFor={detail} empty="No open high-priority tickets." note={(t) => `Owner: ${t.owner?.name ?? "Unassigned"}`} />
              </Panel>
              <Panel id="recently-updated-heading" title="Recently updated" action={<Link to="/staff/queue" className="small">View all</Link>}>
                <TicketRows items={data.recentlyUpdated} hrefFor={detail} empty="No tickets yet." note={(t) => `Owner: ${t.owner?.name ?? "Unassigned"}`} />
              </Panel>
            </div>
            <div className="col-lg-4">
              <Panel id="quick-actions-heading" title="Quick Actions">
                <div className="d-grid gap-2 p-3">
                  <Link to="/staff/queue" className="btn btn-success">
                    Ticket Queue
                  </Link>
                  <Link to={queue({ statusGroup: "active", owner: "unassigned" })} className="btn btn-outline-success">
                    Unassigned tickets
                  </Link>
                  <Link to={queue({ statusGroup: "active", owner: "me" })} className="btn btn-outline-success">
                    My tickets
                  </Link>
                </div>
              </Panel>
              <Panel id="by-status-heading" title="Tickets by status">
                <Breakdown rows={ALL_STATUSES.map((s: TicketStatus) => ({ label: STATUS_LABEL[s], value: data.byStatus[s], to: queue({ status: s }) }))} />
              </Panel>
              <Panel id="by-priority-heading" title="Open tickets by IT priority">
                <Breakdown
                  rows={PRIORITIES.map((p) => ({ label: PRIORITY_LABEL[p], value: data.byItPriority[p], to: queue({ statusGroup: "active", itPriority: p }) }))}
                />
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
