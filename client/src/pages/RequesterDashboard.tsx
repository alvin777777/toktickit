import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RequesterDashboardData, getRequesterDashboard } from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { DashboardError, DashboardLoading, MetricCard, Panel, TicketRows, drillDown, firstName } from "../components/DashboardParts.js";

// docs/lab-04/ui-spec.md §3 — Requester Dashboard (FR-11, BR-28). Numbers come from the backend
// and cover only the signed-in Requester's tickets; every card opens My Tickets pre-filtered.
const CARDS: { key: keyof RequesterDashboardData["metrics"]; label: string }[] = [
  { key: "open", label: "My Open Tickets" },
  { key: "waitingForMe", label: "Waiting for Me" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export default function RequesterDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<RequesterDashboardData | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");

  async function load() {
    setState("loading");
    try {
      setData(await getRequesterDashboard());
      setState("success");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const detail = (tn: string) => `/tickets/${encodeURIComponent(tn)}`;

  return (
    <div className="container py-4" style={{ maxWidth: 1200 }}>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Welcome, {firstName(user?.name)}!</h1>
          <p className="text-muted small mb-0">Here's the latest on your requests.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load} disabled={state === "loading"}>
          ↻ Refresh
        </button>
      </div>

      {state === "loading" && !data && <DashboardLoading />}
      {state === "error" && <DashboardError onRetry={load} />}
      {data && state !== "error" && (
        <>
          <div className="row g-3 mb-4" data-testid="requester-metrics">
            {CARDS.map(({ key, label }) => (
              <div key={key} className="col-6 col-lg-3">
                <MetricCard label={label} value={data.metrics[key].value} to={drillDown("/tickets", data.metrics[key].query) ?? "/tickets"} hint="View all" />
              </div>
            ))}
          </div>
          <div className="row g-3">
            <div className="col-lg-8">
              <Panel id="needs-attention-heading" title="Needs your attention">
                <TicketRows
                  items={data.needsAttention}
                  hrefFor={detail}
                  empty="Nothing needs your attention right now."
                  note={(t) => (t.currentStatus === "WAITING_FOR_REQUESTER" ? "Waiting for your reply" : "Resolved — please check it works")}
                />
              </Panel>
              <Panel id="recently-updated-heading" title="Recently updated" action={<Link to="/tickets" className="small">View all</Link>}>
                <TicketRows items={data.recentlyUpdated} hrefFor={detail} empty="You have no tickets yet." />
              </Panel>
              <Panel id="recently-resolved-heading" title={`Recently resolved (last ${data.recentWindowDays} days)`}>
                <TicketRows items={data.recentlyResolved} hrefFor={detail} empty="Nothing was resolved in the last week." date="resolved" />
              </Panel>
            </div>
            <div className="col-lg-4">
              <Panel id="quick-actions-heading" title="Quick Actions">
                <div className="d-grid gap-2 p-3">
                  <Link to="/tickets/new" className="btn btn-success">
                    + Create Ticket
                  </Link>
                  <Link to="/tickets" className="btn btn-outline-success">
                    View My Tickets
                  </Link>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
