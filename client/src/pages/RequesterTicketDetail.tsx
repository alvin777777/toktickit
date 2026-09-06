import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AttachmentInfo, TicketDetail, getTicketDetail } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";
import AttachmentSection from "../components/AttachmentSection.js";

type LoadState = "loading" | "success" | "notFound" | "error";

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-secondary",
  MEDIUM: "bg-warning text-dark",
  HIGH: "bg-danger",
};

// ui-spec.md §5.5 — Requester Ticket Detail (View Mode).
export default function RequesterTicketDetail() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const { requester } = useRequester();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);

  useEffect(() => {
    if (!requester || !ticketNumber) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requester, ticketNumber]);

  async function load() {
    if (!requester || !ticketNumber) return;
    setLoadState("loading");
    try {
      const result = await getTicketDetail(requester.id, ticketNumber);
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

  return (
    <div className="container py-4" style={{ maxWidth: 800 }}>
      <div className="mb-3">
        <Link to="/tickets" className="small">
          ← Back to My Tickets
        </Link>
      </div>
      <h1 className="h4 mb-3">Ticket Details</h1>

      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <label className="form-label fw-semibold small">Ticket No.</label>
          <input className="form-control" style={readonlyField} readOnly value={ticket.ticketNumber} />
        </div>
        <div className="col-md-4">
          <label className="form-label fw-semibold small">Ticket Date</label>
          <input
            className="form-control"
            style={readonlyField}
            readOnly
            value={new Date(ticket.ticketDate).toLocaleString()}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label fw-semibold small">Requested Priority</label>
          <div>
            <span className={`badge ${PRIORITY_BADGE[ticket.requestedPriority]}`}>{ticket.requestedPriority}</span>
          </div>
        </div>
        <div className="col-md-4">
          <label className="form-label fw-semibold small">Current Status</label>
          <div>
            <span className="badge bg-info text-dark">{ticket.currentStatus}</span>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label fw-semibold small">Summary</label>
        <input className="form-control" style={readonlyField} readOnly value={ticket.summary} />
      </div>

      <div className="mb-3">
        <label className="form-label fw-semibold small">Description</label>
        <textarea className="form-control" style={readonlyField} readOnly rows={4} value={ticket.description} />
      </div>

      <AttachmentSection
        requesterId={requester!.id}
        ticketNumber={ticket.ticketNumber}
        attachments={ticket.attachments}
        onChange={handleAttachmentsChange}
      />
    </div>
  );
}
