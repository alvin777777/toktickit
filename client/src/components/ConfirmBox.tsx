import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ui-spec.md §11 — inline confirmation panel (focus moves in, Escape cancels). Used for Closed /
// Cancelled transitions (BR-31), "Problem Appears Resolved", and Set Initial Password.
export default function ConfirmBox({ title, message, confirmLabel, danger, busy, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-labelledby="confirm-title"
      className="border rounded p-3 mt-2 bg-light"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div id="confirm-title" className="fw-semibold mb-1">
        {title}
      </div>
      <p className="small mb-2">{message}</p>
      <div className="d-flex gap-2">
        <button ref={confirmRef} className={`btn btn-sm ${danger ? "btn-danger" : "btn-success"}`} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
