import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  Assignee,
  Priority,
  StaffTicket,
  TicketStatus,
  claimTicket,
  downloadAttachment,
  getAssignees,
  getComments,
  getInternalNotes,
  getStaffTicket,
  postComment,
  postInternalNote,
  setItPriority,
  setTicketOwner,
  setTicketStatus,
} from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { PRIORITY_BADGE, STATUS_LABEL, StatusBadge } from "../components/badges.js";
import EntryThread from "../components/EntryThread.js";
import ConfirmBox from "../components/ConfirmBox.js";

type LoadState = "loading" | "success" | "notFound" | "error";
type Tab = "comments" | "notes" | "attachments";

const readonlyField = { backgroundColor: "#F3F1EA" };
const CONFIRM_TEXT: Partial<Record<TicketStatus, { title: string; message: string }>> = {
  CLOSED: { title: "Close this ticket?", message: "This can only be undone by reopening the ticket." },
  CANCELLED: { title: "Cancel this ticket?", message: "This cannot be undone." },
};

// ui-spec.md §7 — IT Staff Ticket Detail (FR-14..FR-19).
export default function StaffTicketDetail() {
  const { ticketNumber = "" } = useParams<{ ticketNumber: string }>();
  const { user } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<StaffTicket | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [tab, setTab] = useState<Tab>("comments");

  // Owner control
  const [ownerMode, setOwnerMode] = useState<"view" | "reassign">("view");
  const [ownerChoice, setOwnerChoice] = useState<string>("");
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState("");

  // IT priority
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityNote, setPriorityNote] = useState("");

  // Status
  const [statusChoice, setStatusChoice] = useState<TicketStatus | "">("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<TicketStatus | null>(null);

  const [actionError, setActionError] = useState("");

  useEffect(() => {
    load();
    getAssignees().then(setAssignees).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber]);

  async function load() {
    setLoadState("loading");
    try {
      const result = await getStaffTicket(ticketNumber);
      if (!result) return setLoadState("notFound");
      setTicket(result);
      setLoadState("success");
    } catch {
      setLoadState("error");
    }
  }

  function applyUpdate(updated: StaffTicket) {
    setTicket(updated);
  }

  function describe(err: unknown, fallback: string): string {
    if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
      const field = Object.values(err.fields)[0];
      return field ?? err.message;
    }
    return fallback;
  }

  async function handleClaim() {
    setOwnerError("");
    setOwnerBusy(true);
    try {
      applyUpdate(await claimTicket(ticketNumber));
    } catch (err) {
      setOwnerError(describe(err, "Unable to claim this ticket right now. Please try again."));
      if (err instanceof ApiError && err.code === "ALREADY_ASSIGNED") {
        await load(); // someone else got there first — show the real owner and offer Reassign
        setOwnerMode("reassign");
      }
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleReassign() {
    setOwnerError("");
    setOwnerBusy(true);
    try {
      applyUpdate(await setTicketOwner(ticketNumber, ownerChoice === "" ? null : Number(ownerChoice)));
      setOwnerMode("view");
    } catch (err) {
      setOwnerError(describe(err, "Unable to change the ticket owner right now. Please try again."));
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handlePriority(value: Priority) {
    setPriorityNote("");
    setActionError("");
    setPriorityBusy(true);
    try {
      applyUpdate(await setItPriority(ticketNumber, value));
      setPriorityNote("Saved");
    } catch (err) {
      setActionError(describe(err, "Unable to update IT priority right now. Please try again."));
    } finally {
      setPriorityBusy(false);
    }
  }

  function requestStatusChange() {
    if (!statusChoice) return;
    setStatusError("");
    if (CONFIRM_TEXT[statusChoice]) {
      setConfirmStatus(statusChoice); // BR-31
      return;
    }
    void commitStatus(statusChoice);
  }

  async function commitStatus(status: TicketStatus) {
    setStatusBusy(true);
    try {
      applyUpdate(await setTicketStatus(ticketNumber, status));
      setStatusChoice("");
      setConfirmStatus(null);
    } catch (err) {
      setStatusError(describe(err, "Unable to update the status right now. Please try again."));
      setConfirmStatus(null);
      if (err instanceof ApiError && err.code === "INVALID_TRANSITION") await load();
    } finally {
      setStatusBusy(false);
    }
  }

  if (loadState === "loading") {
    return (
      <div className="container py-5 text-center text-muted" role="status">
        Loading ticket…
      </div>
    );
  }
  if (loadState === "notFound") {
    return (
      <div className="container py-5 text-center">
        <p className="text-muted mb-3">Ticket not found.</p>
        <Link to="/staff/queue" className="btn btn-outline-secondary">
          Back to Queue
        </Link>
      </div>
    );
  }
  if (loadState === "error" || !ticket) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger" role="alert">
          Unable to load this ticket. Please try again.
          <div className="mt-2">
            <button className="btn btn-sm btn-outline-danger" onClick={load}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const terminal = ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED";
  const activeAttachments = ticket.attachments.filter((a) => !a.removedAt);

  return (
    <div className="container py-4" style={{ maxWidth: 1000 }}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb mb-0 small">
            <li className="breadcrumb-item">
              <Link to="/staff/queue">Ticket Queue</Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              Ticket Detail
            </li>
          </ol>
        </nav>
        <Link to="/staff/queue" className="btn btn-outline-secondary btn-sm">
          ← Back to Queue
        </Link>
      </div>

      {ticket.requesterResolvedAt && (
        <div className="alert py-2" style={{ backgroundColor: "#EAF6EF", color: "#1B2B24" }} data-testid="requester-resolved-banner">
          ✓ The requester indicated this problem appears resolved on {new Date(ticket.requesterResolvedAt).toLocaleDateString()}.
        </div>
      )}
      {actionError && (
        <div className="alert alert-danger py-2" role="alert">
          {actionError}
        </div>
      )}

      {/* Ticket information (read-only) */}
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h1 className="h5 mb-3">
            {ticket.ticketNumber} <StatusBadge status={ticket.currentStatus} />
          </h1>
          <div className="row g-3">
            <div className="col-md-6 col-lg-4">
              <label htmlFor="sd-ticket-number" className="form-label fw-semibold small">
                Ticket No.
              </label>
              <input id="sd-ticket-number" className="form-control" style={readonlyField} readOnly value={ticket.ticketNumber} />
            </div>
            <div className="col-md-6 col-lg-4">
              <label htmlFor="sd-category" className="form-label fw-semibold small">
                Category
              </label>
              <input id="sd-category" className="form-control" style={readonlyField} readOnly value={ticket.category.name} />
            </div>
            <div className="col-md-6 col-lg-4">
              <label htmlFor="sd-system" className="form-label fw-semibold small">
                Related System
              </label>
              <input id="sd-system" className="form-control" style={readonlyField} readOnly value={ticket.relatedSystem.name} />
            </div>
            <div className="col-md-6 col-lg-4">
              <label htmlFor="sd-requester" className="form-label fw-semibold small">
                Requester
              </label>
              <input id="sd-requester" className="form-control" style={readonlyField} readOnly value={ticket.requester.name} />
              <div className="form-text">{ticket.requester.email}</div>
            </div>
            <div className="col-md-6 col-lg-4">
              <label className="form-label fw-semibold small d-block">Requested Priority</label>
              <span className={`badge ${PRIORITY_BADGE[ticket.requestedPriority]}`} data-testid="requested-priority">
                {ticket.requestedPriority}
              </span>
            </div>
            <div className="col-md-6 col-lg-4">
              <label htmlFor="sd-created" className="form-label fw-semibold small">
                Created
              </label>
              <input id="sd-created" className="form-control" style={readonlyField} readOnly value={new Date(ticket.createdAt).toLocaleString()} />
            </div>
            <div className="col-12">
              <label htmlFor="sd-summary" className="form-label fw-semibold small">
                Summary
              </label>
              <input id="sd-summary" className="form-control" style={readonlyField} readOnly value={ticket.summary} />
            </div>
            <div className="col-12">
              <label htmlFor="sd-description" className="form-label fw-semibold small">
                Description
              </label>
              <textarea id="sd-description" className="form-control" style={readonlyField} readOnly rows={4} value={ticket.description} />
            </div>
          </div>
        </div>
      </div>

      {/* Operations (editable) */}
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h2 className="h6 mb-3">Operations</h2>
          <div className="row g-3">
            <div className="col-md-6 col-lg-4">
              <label className="form-label fw-semibold small d-block">Ticket Owner</label>
              {ownerMode === "view" && (
                <>
                  <div className="mb-2" data-testid="owner-name">
                    {ticket.owner ? ticket.owner.name : <span className="text-muted">Unassigned</span>}
                  </div>
                  {!terminal && (
                    <div className="d-flex gap-2 flex-wrap">
                      {!ticket.owner && (
                        <button className="btn btn-success btn-sm" onClick={handleClaim} disabled={ownerBusy}>
                          {ownerBusy ? "Claiming…" : "Claim"}
                        </button>
                      )}
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          setOwnerChoice(ticket.owner ? String(ticket.owner.id) : "");
                          setOwnerError("");
                          setOwnerMode("reassign");
                        }}
                      >
                        {ticket.owner ? "Reassign" : "Assign"}
                      </button>
                    </div>
                  )}
                </>
              )}
              {ownerMode === "reassign" && (
                <div>
                  <select
                    className="form-select form-select-sm mb-2"
                    aria-label="Select ticket owner"
                    value={ownerChoice}
                    onChange={(e) => setOwnerChoice(e.target.value)}
                    disabled={ownerBusy}
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.id === user?.id ? " (me)" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="d-flex gap-2">
                    <button className="btn btn-success btn-sm" onClick={handleReassign} disabled={ownerBusy}>
                      {ownerBusy ? "Saving…" : "Save Owner"}
                    </button>
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => setOwnerMode("view")} disabled={ownerBusy}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {ownerError && (
                <div className="text-danger small mt-2" role="alert">
                  {ownerError}
                </div>
              )}
            </div>

            <div className="col-md-6 col-lg-4">
              <label htmlFor="sd-it-priority" className="form-label fw-semibold small">
                IT Priority
              </label>
              <select
                id="sd-it-priority"
                className="form-select form-select-sm"
                value={ticket.itPriority}
                onChange={(e) => handlePriority(e.target.value as Priority)}
                disabled={priorityBusy || terminal}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
              <div className="form-text">
                Requested: <span className={`badge ${PRIORITY_BADGE[ticket.requestedPriority]}`}>{ticket.requestedPriority}</span>
                {priorityNote && (
                  <span className="text-success ms-2" role="status">
                    {priorityNote}
                  </span>
                )}
              </div>
            </div>

            <div className="col-md-6 col-lg-4">
              <label htmlFor="sd-status" className="form-label fw-semibold small">
                Status
              </label>
              <div className="mb-1">
                <StatusBadge status={ticket.currentStatus} />
              </div>
              {ticket.allowedTransitions.length === 0 ? (
                <div className="form-text">No further status changes are possible.</div>
              ) : (
                <>
                  <div className="d-flex gap-2">
                    <select
                      id="sd-status"
                      className="form-select form-select-sm"
                      value={statusChoice}
                      onChange={(e) => setStatusChoice(e.target.value as TicketStatus)}
                      disabled={statusBusy}
                    >
                      <option value="">Change to…</option>
                      {ticket.allowedTransitions.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-success btn-sm text-nowrap" onClick={requestStatusChange} disabled={!statusChoice || statusBusy}>
                      {statusBusy ? "Saving…" : "Update Status"}
                    </button>
                  </div>
                  {confirmStatus && CONFIRM_TEXT[confirmStatus] && (
                    <ConfirmBox
                      title={CONFIRM_TEXT[confirmStatus]!.title}
                      message={CONFIRM_TEXT[confirmStatus]!.message}
                      confirmLabel={`Yes, ${STATUS_LABEL[confirmStatus].toLowerCase()} it`}
                      danger={confirmStatus === "CANCELLED"}
                      busy={statusBusy}
                      onConfirm={() => commitStatus(confirmStatus)}
                      onCancel={() => setConfirmStatus(null)}
                    />
                  )}
                </>
              )}
              {statusError && (
                <div className="alert alert-danger py-1 px-2 small mt-2 mb-0" role="alert">
                  {statusError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3 flex-nowrap overflow-auto" role="tablist">
        {(
          [
            ["comments", "Public Comments"],
            ["notes", "Internal Notes"],
            ["attachments", `Attachments (${activeAttachments.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <li className="nav-item" role="presentation" key={key}>
            <button
              className={"nav-link text-nowrap" + (tab === key ? " active" : "")}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      {tab === "comments" && (
        <EntryThread
          kind="comment"
          testId="public-comments"
          load={() => getComments(ticket.ticketNumber)}
          post={(body) => postComment(ticket.ticketNumber, body)}
          disabledReason={terminal ? "Comments are closed for this ticket." : undefined}
        />
      )}
      {tab === "notes" && (
        <EntryThread
          kind="note"
          testId="internal-notes"
          load={() => getInternalNotes(ticket.ticketNumber)}
          post={(body) => postInternalNote(ticket.ticketNumber, body)}
        />
      )}
      {tab === "attachments" && (
        <div data-testid="attachments">
          {ticket.attachments.length === 0 && <p className="text-muted small">No attachments.</p>}
          <ul className="list-group">
            {ticket.attachments.map((a) => (
              <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                <div>
                  <span className={a.removedAt ? "text-muted text-decoration-line-through" : ""}>{a.originalFilename}</span>{" "}
                  <span className="text-muted small">({Math.round(a.sizeBytes / 1024)} KB)</span>
                  <div className="text-muted small">Uploaded {new Date(a.uploadedAt).toLocaleDateString()}</div>
                  {a.removedAt && (
                    <div className="text-muted small">
                      Removed {new Date(a.removedAt).toLocaleDateString()} — {a.removedReason}
                    </div>
                  )}
                </div>
                {!a.removedAt && (
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => downloadAttachment(a).catch(() => setActionError("Unable to download attachment right now."))}
                  >
                    Download
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
