import { useState } from "react";
import { AttachmentInfo, addAttachment, downloadAttachment, removeAttachment } from "../api.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

interface Props {
  requesterId: number;
  ticketNumber: string;
  attachments: AttachmentInfo[];
  onChange: (attachments: AttachmentInfo[]) => void;
}

// ui-spec.md §5.5 — Attachments section of Requester Ticket Detail.
export default function AttachmentSection({ requesterId, ticketNumber, attachments, onChange }: Props) {
  const [pickError, setPickError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [actionError, setActionError] = useState("");

  const activeCount = attachments.filter((a) => !a.removedAt).length;

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    setPickError("");
    setActionError("");
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (activeCount >= MAX_ATTACHMENTS) {
      setPickError(`This ticket already has ${MAX_ATTACHMENTS} active attachments.`);
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      setPickError(`"${file.name}" is not an allowed file type (JPG, PNG, WEBP, PDF only).`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPickError(`"${file.name}" is larger than 5 MB.`);
      return;
    }

    setUploading(true);
    try {
      const added = await addAttachment(requesterId, ticketNumber, file);
      onChange([...attachments, added]);
    } catch {
      setActionError("Unable to add attachment right now. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function startRemove(id: number) {
    setRemovingId(id);
    setRemovalReason("");
    setRemoveError("");
  }

  async function confirmRemove(id: number) {
    if (removalReason.trim().length < 3) {
      setRemoveError("Please provide a reason (at least 3 characters).");
      return;
    }
    try {
      const updated = await removeAttachment(requesterId, id, removalReason.trim());
      onChange(attachments.map((a) => (a.id === id ? updated : a)));
      setRemovingId(null);
    } catch {
      setRemoveError("Unable to remove attachment right now. Please try again.");
    }
  }

  async function handleDownload(attachment: AttachmentInfo) {
    setActionError("");
    try {
      await downloadAttachment(requesterId, attachment);
    } catch {
      setActionError("Unable to download attachment right now. Please try again.");
    }
  }

  return (
    <div className="mt-4">
      <h2 className="h6">Attachments</h2>

      <div className="mb-2">
        <input
          type="file"
          className="form-control form-control-sm"
          style={{ maxWidth: 320 }}
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={handleFilePick}
          disabled={uploading || activeCount >= MAX_ATTACHMENTS}
          aria-label="Add attachment"
        />
        {pickError && <div className="text-danger small mt-1">{pickError}</div>}
        {actionError && <div className="text-danger small mt-1">{actionError}</div>}
      </div>

      {attachments.length === 0 && <p className="text-muted small">No attachments yet.</p>}

      <ul className="list-group">
        {attachments.map((a) => (
          <li key={a.id} className="list-group-item">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <span className={a.removedAt ? "text-muted text-decoration-line-through" : ""}>
                  {a.originalFilename}
                </span>{" "}
                <span className="text-muted small">({Math.round(a.sizeBytes / 1024)} KB)</span>
                {a.removedAt && (
                  <div className="text-muted small">
                    Removed {new Date(a.removedAt).toLocaleDateString()} — {a.removedReason}
                  </div>
                )}
              </div>
              {!a.removedAt && (
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => handleDownload(a)}>
                    Download
                  </button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => startRemove(a.id)}>
                    Remove
                  </button>
                </div>
              )}
            </div>

            {removingId === a.id && (
              <div className="mt-2 p-2 border rounded bg-light">
                <label htmlFor={`removal-reason-${a.id}`} className="form-label small fw-semibold mb-1">
                  Reason for removal <span className="text-danger">*</span>
                </label>
                <input
                  id={`removal-reason-${a.id}`}
                  type="text"
                  className="form-control form-control-sm mb-2"
                  value={removalReason}
                  onChange={(e) => setRemovalReason(e.target.value)}
                />
                {removeError && <div className="text-danger small mb-2">{removeError}</div>}
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-danger" onClick={() => confirmRemove(a.id)}>
                    Confirm Removal
                  </button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setRemovingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
