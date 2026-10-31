import { StatusHistoryEntry } from "../api.js";
import { ROLE_LABEL } from "../context/AuthContext.js";
import { StatusBadge } from "./badges.js";

// docs/lab-04/ui-spec.md §6 — append-only status history (BR-24), oldest first as the API returns
// it. Shared by the IT Staff History tab and the Requester "Status history" section.
export default function StatusHistory({ entries }: { entries: StatusHistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-muted small mb-0">No status changes recorded yet.</p>;
  return (
    <ol className="list-unstyled mb-0" data-testid="status-history">
      {entries.map((h) => (
        <li key={h.id} className="d-flex flex-wrap align-items-center gap-2 py-2 border-bottom small">
          {h.fromStatus ? (
            <>
              <StatusBadge status={h.fromStatus} /> <span aria-hidden="true">→</span>
              <span className="visually-hidden">to</span>
            </>
          ) : (
            <span className="text-muted">Created as</span>
          )}
          <StatusBadge status={h.toStatus} />
          <span className="ms-sm-auto">
            {h.changedBy ? (
              <>
                {h.changedBy.name} <span className="badge bg-light text-dark border">{ROLE_LABEL[h.changedBy.role]}</span>
              </>
            ) : (
              <span className="text-muted">System (migration)</span>
            )}
          </span>
          <time className="text-muted" dateTime={h.changedAt}>
            {new Date(h.changedAt).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  );
}
