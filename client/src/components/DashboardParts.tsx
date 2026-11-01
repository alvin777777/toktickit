import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TicketSummary, toQueryString } from "../api.js";
import { StatusBadge } from "./badges.js";

// docs/lab-04/ui-spec.md §1.2 / §1.3 — building blocks shared by both dashboards.

export function drillDown(base: string, query: Record<string, string> | null): string | null {
  if (!query) return null;
  const qs = toQueryString(query);
  return qs ? `${base}?${qs}` : base;
}

// One link per card: its accessible name carries label, value, and destination (§1.2, §10).
export function MetricCard({ label, value, to, hint }: { label: string; value: number; to: string; hint?: string }) {
  const body = (
    <div className="card-body p-3 d-flex flex-column">
      <span className="small text-muted">{label}</span>
      <span className="fs-2 fw-semibold" style={{ color: "#1B2B24" }}>
        {value}
      </span>
      <span className="small mt-auto" style={{ color: "#006B3C" }}>
        {hint ?? "View"} <span aria-hidden="true">→</span>
      </span>
    </div>
  );
  const props = {
    className: "card h-100 text-decoration-none metric-card",
    style: { border: "1px solid #DDE5E0", borderRadius: "0.5rem" },
    "aria-label": `${label}: ${value}. ${hint ?? "View tickets"}`,
    "data-testid": "metric-card",
  };
  // In-page targets (e.g. the My Open Actions list) are plain anchors so the browser scrolls to them.
  if (to.startsWith("#")) return <a href={to} {...props}>{body}</a>;
  return (
    <Link to={to} {...props}>
      {body}
    </Link>
  );
}

export function Panel({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card shadow-sm mb-3" aria-labelledby={id} id={id.replace(/-heading$/, "")}>
      <div className="card-header bg-white d-flex justify-content-between align-items-center gap-2">
        <h2 id={id} className="h6 mb-0">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TicketRows({
  items,
  hrefFor,
  empty,
  note,
  date = "updated",
}: {
  items: TicketSummary[];
  hrefFor: (ticketNumber: string) => string;
  empty: string;
  note?: (t: TicketSummary) => string | null;
  date?: "updated" | "resolved";
}) {
  if (items.length === 0) return <p className="text-muted small m-3">{empty}</p>;
  return (
    <ul className="list-group list-group-flush">
      {items.map((t) => {
        const when = date === "resolved" && t.resolvedAt ? t.resolvedAt : t.updatedAt;
        const extra = note?.(t);
        return (
          <li key={t.ticketNumber} className="list-group-item d-flex flex-wrap align-items-center gap-2">
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <Link to={hrefFor(t.ticketNumber)} className="fw-semibold small" style={{ color: "#006B3C" }}>
                {t.ticketNumber}
              </Link>
              <div className="small text-truncate" title={t.summary}>
                {t.summary}
              </div>
              {extra && <div className="small text-muted">{extra}</div>}
            </div>
            <StatusBadge status={t.currentStatus} />
            <time className="small text-muted text-nowrap" dateTime={when}>
              {new Date(when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">Loading dashboard…</span>
      <div className="row g-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="col-6 col-lg-3">
            <div className="card placeholder-glow p-3" style={{ minHeight: 110 }}>
              <span className="placeholder col-6 mb-3" />
              <span className="placeholder col-3 placeholder-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="alert alert-danger" role="alert">
      Unable to load the dashboard right now. Please try again.
      <div className="mt-2">
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

export function firstName(name?: string) {
  return name?.split(" ")[0] ?? "";
}
