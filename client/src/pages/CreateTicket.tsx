import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AttachmentError,
  Category,
  RelatedSystem,
  TicketValidationError,
  createTicket,
  getCategories,
  getRelatedSystems,
} from "../api.js";
import { useRequester } from "../context/RequesterContext.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

type Priority = "LOW" | "MEDIUM" | "HIGH";
type FormStage = "form" | "submitting" | "success";

interface PendingAttachment {
  file: File;
}

// ui-spec.md §5.3 — Create Ticket screen.
export default function CreateTicket() {
  const { requester } = useRequester();

  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [refDataError, setRefDataError] = useState(false);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [relatedSystemId, setRelatedSystemId] = useState<number | "">("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [requestedPriority, setRequestedPriority] = useState<Priority | "">("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentPickError, setAttachmentPickError] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [stage, setStage] = useState<FormStage>("form");
  const [successTicketNumber, setSuccessTicketNumber] = useState("");
  const [successAttachmentErrors, setSuccessAttachmentErrors] = useState<AttachmentError[]>([]);

  useEffect(() => {
    Promise.all([getCategories(), getRelatedSystems()])
      .then(([cats, systems]) => {
        setCategories(cats);
        setRelatedSystems(systems);
      })
      .catch(() => setRefDataError(true));
  }, []);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachmentPickError("");
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file name after removing it

    // Accumulate locally and commit once — using `attachments.length`/setAttachments per file
    // inside this loop would read the same stale count on every iteration (state doesn't update
    // until after the handler returns), letting a single multi-select bypass the 5-file cap.
    let pickError = "";
    const accepted: PendingAttachment[] = [];
    let count = attachments.length;

    for (const file of picked) {
      if (count >= MAX_ATTACHMENTS) {
        pickError = `You can attach at most ${MAX_ATTACHMENTS} files.`;
        break;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        pickError = `"${file.name}" is not an allowed file type (JPG, PNG, WEBP, PDF only).`;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        pickError = `"${file.name}" is larger than 5 MB.`;
        continue;
      }
      accepted.push({ file });
      count += 1;
    }

    if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
    if (pickError) setAttachmentPickError(pickError);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setCategoryId("");
    setRelatedSystemId("");
    setSummary("");
    setDescription("");
    setRequestedPriority("");
    setAttachments([]);
    setFieldErrors({});
    setApiError("");
    setStage("form");
    setSuccessTicketNumber("");
    setSuccessAttachmentErrors([]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError("");

    // Client-side validation (AC-04/AC-05) — no API call when required fields are empty.
    const errors: Record<string, string> = {};
    if (summary.trim().length === 0) errors.summary = "Summary is required.";
    if (description.trim().length === 0) errors.description = "Description is required.";
    if (!categoryId) errors.categoryId = "Select a category.";
    if (!relatedSystemId) errors.relatedSystemId = "Select a related system.";
    if (!requestedPriority) errors.requestedPriority = "Select a requested priority.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    if (!requester) return; // route guard should prevent this, but keep the compiler happy

    setStage("submitting");
    try {
      const result = await createTicket(requester.id, {
        categoryId: Number(categoryId),
        relatedSystemId: Number(relatedSystemId),
        summary,
        description,
        requestedPriority: requestedPriority as Priority,
        attachments: attachments.map((a) => a.file),
      });
      setSuccessTicketNumber(result.ticketNumber);
      setSuccessAttachmentErrors(result.attachmentErrors); // BR-15 — surface partial upload failures
      setStage("success");
    } catch (err) {
      if (err instanceof TicketValidationError) {
        setFieldErrors(err.fields);
      } else {
        setApiError("Unable to create ticket right now. Your entries have been kept — please try again.");
      }
      setStage("form");
    }
  }

  if (stage === "success") {
    return (
      <div className="container py-4" style={{ maxWidth: 640 }}>
        <div className="alert" style={{ backgroundColor: "#EAF6EF", color: "#1B2B24" }}>
          <h2 className="h5 mb-2">Ticket created</h2>
          <p className="mb-1">
            Your Ticket Number is <strong>{successTicketNumber}</strong>.
          </p>
          {successAttachmentErrors.length > 0 && (
            <div className="alert alert-warning mt-2 mb-0" role="alert">
              <p className="mb-1 fw-semibold">
                The ticket was saved, but {successAttachmentErrors.length === 1 ? "one attachment" : "some attachments"} could not be added:
              </p>
              <ul className="mb-0">
                {successAttachmentErrors.map((e, i) => (
                  <li key={i}>
                    {e.filename} — {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="d-flex gap-2 mt-3">
            <Link to="/tickets" className="btn btn-success">
              View My Tickets
            </Link>
            <button className="btn btn-outline-secondary" onClick={resetForm}>
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <h1 className="h4 mb-4">Create Ticket</h1>

      {refDataError && (
        <div className="alert alert-danger" role="alert">
          Unable to load categories/related systems. Please refresh and try again.
        </div>
      )}

      {apiError && (
        <div className="alert alert-danger" role="alert">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <label htmlFor="category" className="form-label fw-semibold">
              Category <span className="text-danger">*</span>
            </label>
            <select
              id="category"
              className={"form-select" + (fieldErrors.categoryId ? " is-invalid" : "")}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
              disabled={stage === "submitting"}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId && <div className="invalid-feedback">{fieldErrors.categoryId}</div>}
          </div>

          <div className="col-md-4">
            <label htmlFor="relatedSystem" className="form-label fw-semibold">
              Related System <span className="text-danger">*</span>
            </label>
            <select
              id="relatedSystem"
              className={"form-select" + (fieldErrors.relatedSystemId ? " is-invalid" : "")}
              value={relatedSystemId}
              onChange={(e) => setRelatedSystemId(e.target.value ? Number(e.target.value) : "")}
              disabled={stage === "submitting"}
            >
              <option value="">Choose…</option>
              {relatedSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {fieldErrors.relatedSystemId && (
              <div className="invalid-feedback">{fieldErrors.relatedSystemId}</div>
            )}
          </div>

          <div className="col-md-4">
            <label htmlFor="priority" className="form-label fw-semibold">
              Requested Priority <span className="text-danger">*</span>
            </label>
            <select
              id="priority"
              className={"form-select" + (fieldErrors.requestedPriority ? " is-invalid" : "")}
              value={requestedPriority}
              onChange={(e) => setRequestedPriority(e.target.value as Priority)}
              disabled={stage === "submitting"}
            >
              <option value="">Choose…</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            {fieldErrors.requestedPriority && (
              <div className="invalid-feedback">{fieldErrors.requestedPriority}</div>
            )}
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="summary" className="form-label fw-semibold">
            Summary <span className="text-danger">*</span>
          </label>
          <input
            id="summary"
            type="text"
            className={"form-control" + (fieldErrors.summary ? " is-invalid" : "")}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={stage === "submitting"}
            maxLength={150}
          />
          {fieldErrors.summary && <div className="invalid-feedback">{fieldErrors.summary}</div>}
        </div>

        <div className="mb-3">
          <label htmlFor="description" className="form-label fw-semibold">
            Description <span className="text-danger">*</span>
          </label>
          <textarea
            id="description"
            rows={5}
            className={"form-control" + (fieldErrors.description ? " is-invalid" : "")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={stage === "submitting"}
            maxLength={2000}
          />
          {fieldErrors.description && <div className="invalid-feedback">{fieldErrors.description}</div>}
        </div>

        <div className="mb-4">
          <label htmlFor="attachments" className="form-label fw-semibold">
            Attachments
          </label>
          <input
            id="attachments"
            type="file"
            className="form-control"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={handleFilePick}
            disabled={stage === "submitting" || attachments.length >= MAX_ATTACHMENTS}
          />
          <div className="form-text">JPG, PNG, WEBP, or PDF — up to 5 MB each, 5 files max.</div>
          {attachmentPickError && <div className="text-danger small mt-1">{attachmentPickError}</div>}

          {attachments.length > 0 && (
            <ul className="list-group mt-2">
              {attachments.map((a, i) => (
                <li key={i} className="list-group-item d-flex justify-content-between align-items-center">
                  <span>
                    {a.file.name} <span className="text-muted small">({Math.round(a.file.size / 1024)} KB)</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => removeAttachment(i)}
                    disabled={stage === "submitting"}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="d-flex justify-content-end gap-2">
          <Link to="/tickets" className="btn btn-outline-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn-success" disabled={stage === "submitting"}>
            {stage === "submitting" ? "Saving…" : "Create Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
