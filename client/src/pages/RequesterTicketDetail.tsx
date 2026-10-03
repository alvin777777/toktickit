import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  AttachmentInfo,
  Category,
  RelatedSystem,
  TicketDetail,
  getCategories,
  getComments,
  getRelatedSystems,
  getTicketDetail,
  markRequesterResolved,
  postComment,
} from "../api.js";
import { useAuth } from "../context/AuthContext.js";
import { PRIORITY_BADGE, StatusBadge } from "../components/badges.js";
import AttachmentSection from "../components/AttachmentSection.js";
import EntryThread from "../components/EntryThread.js";
import ConfirmBox from "../components/ConfirmBox.js";

type LoadState = "loading" | "success" | "notFound" | "error";

// ui-spec.md §5.5 — Requester Ticket Detail (View Mode).
export default function RequesterTicketDetail() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const { user } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [confirmResolved, setConfirmResolved] = useState(false);
  const [resolvedBusy, setResolvedBusy] = useState(false);
  const [resolvedError, setResolvedError] = useState("");

  useEffect(() => {
    // ui-spec.md §5.5 — Category/Related System are shown by name, not id; a failure here
    // shouldn't block the ticket itself from loading, so it's a best-effort side load.
    Promise.all([getCategories(), getRelatedSystems()])
      .then(([cats, systems]) => {
        setCategories(cats);
        setRelatedSystems(systems);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ticketNumber) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber]);

  async function load() {
    if (!ticketNumber) return;
    setLoadState("loading");
    try {
      const result = await getTicketDetail(ticketNumber);
      if (!result) {
        setLoadState("notFound"); // BR-22 — identical outcome whether it doesn't exist or isn't owned
        return;
      }
      setTicket(result);
      setLoadState("success");
    } catch {
      setLoadState("error");
    }
  }

  function handleAttachmentsChange(attachments: AttachmentInfo[]) {
    setTicket((prev) => (prev ? { ...prev, attachments } : prev));
  }

  // FR-11 / BR-32 — the signal is a flag; IT Staff still resolve and close.
  async function handleMarkResolved() {
    setResolvedError("");
    setResolvedBusy(true);
    try {
      setTicket(await markRequesterResolved(ticketNumber!));
      setConfirmResolved(false);
    } catch (err) {
      setResolvedError(
        err instanceof ApiError && err.status === 409 ? err.message : "Unable to update the ticket right now. Please try again."
      );
    } finally {
      setResolvedBusy(false);
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
        <Link to="/tickets" className="btn btn-outline-secondary">
          Back to My Tickets
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

  const readonlyField = { backgroundColor: "#F3F1EA" };
  const terminal = ["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.currentStatus);
  const commentsClosed = ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED";

  return (
    <div className="container py-4" style={{ maxWidth: 800 }}>
      <div className="mb-3">
        <Link to="/tickets" className="small">
          ← Back to My Tickets
        </Link>
      </div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <h1 className="h4 mb-0">Ticket Details</h1>
        {ticket.requesterResolvedAt ? (
          <span className="badge rounded-pill py-2 px-3" style={{ backgroundColor: "#EAF6EF", color: "#0B7A46" }} data-testid="resolved-chip">
            ✓ You indicated this problem appears resolved on {new Date(ticket.requesterResolvedAt).toLocaleDateString()}
          </span>
        ) : (
          !terminal && (
            <button className="btn btn-outline-success btn-sm" onClick={() => setConfirmResolved(true)} disabled={confirmResolved}>
              Problem Appears Resolved
            </button>
          )
        )}
      </div>
      {confirmResolved && (
        <ConfirmBox
          title="Let IT Staff know this problem appears resolved?"
          message="They will still verify and formally resolve or close the ticket."
          confirmLabel="Yes, it appears resolved"
          busy={resolvedBusy}
          onConfirm={handleMarkResolved}
          onCancel={() => setConfirmResolved(false)}
        />
      )}
      {resolvedError && (
        <div className="alert alert-danger py-2" role="alert">
          {resolvedError}
        </div>
      )}

      <div className="row g-3 mb-3">
        <div className="col-md-6 col-lg-4">
          <label htmlFor="detail-ticket-number" className="form-label fw-semibold small">
            Ticket No.
          </label>
          <input
            id="detail-ticket-number"
            className="form-control"
            style={readonlyField}
            readOnly
            value={ticket.ticketNumber}
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor="detail-ticket-date" className="form-label fw-semibold small">
            Ticket Date
          </label>
          <input
            id="detail-ticket-date"
            className="form-control"
            style={readonlyField}
            readOnly
            value={new Date(ticket.ticketDate).toLocaleString()}
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor="detail-requester" className="form-label fw-semibold small">
            Requester
          </label>
          <input
            id="detail-requester"
            className="form-control"
            style={readonlyField}
            readOnly
            value={user?.name ?? ""}
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor="detail-category" className="form-label fw-semibold small">
            Category
          </label>
          <input
            id="detail-category"
            className="form-control"
            style={readonlyField}
            readOnly
            value={categories.find((c) => c.id === ticket.categoryId)?.name ?? "—"}
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor="detail-related-system" className="form-label fw-semibold small">
            Related System
          </label>
          <input
            id="detail-related-system"
            className="form-control"
            style={readonlyField}
            readOnly
            value={relatedSystems.find((s) => s.id === ticket.relatedSystemId)?.name ?? "—"}
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label className="form-label fw-semibold small">Requested Priority</label>
          <div>
            <span className={`badge ${PRIORITY_BADGE[ticket.requestedPriority]}`}>{ticket.requestedPriority}</span>
          </div>
        </div>
        <div className="col-md-6 col-lg-4">
          <label className="form-label fw-semibold small">Current Status</label>
          <div>
            <StatusBadge status={ticket.currentStatus} />
          </div>
        </div>
        <div className="col-md-6 col-lg-4">
          <label htmlFor="detail-owner" className="form-label fw-semibold small">
            Ticket Owner
          </label>
          <input
            id="detail-owner"
            className="form-control"
            style={readonlyField}
            readOnly
            value={ticket.owner?.name ?? "Unassigned"}
          />
        </div>
        <div className="col-md-6 col-lg-4">
          <label className="form-label fw-semibold small">IT Priority</label>
          <div>
            <span className={`badge ${PRIORITY_BADGE[ticket.itPriority]}`}>{ticket.itPriority}</span>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor="detail-summary" className="form-label fw-semibold small">
          Summary
        </label>
        <input
          id="detail-summary"
          className="form-control"
          style={readonlyField}
          readOnly
          value={ticket.summary}
        />
      </div>

      <div className="mb-3">
        <label htmlFor="detail-description" className="form-label fw-semibold small">
          Description
        </label>
        <textarea
          id="detail-description"
          className="form-control"
          style={readonlyField}
          readOnly
          rows={4}
          value={ticket.description}
        />
      </div>

      <AttachmentSection
        ticketNumber={ticket.ticketNumber}
        attachments={ticket.attachments}
        onChange={handleAttachmentsChange}
      />

      <div className="mt-4">
        <h2 className="h6">Public Comments</h2>
        <EntryThread
          kind="comment"
          testId="public-comments"
          load={() => getComments(ticket.ticketNumber)}
          post={(body) => postComment(ticket.ticketNumber, body)}
          disabledReason={commentsClosed ? "Comments are closed for this ticket." : undefined}
        />
      </div>
    </div>
  );
}
