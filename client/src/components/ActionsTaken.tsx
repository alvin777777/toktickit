import { FormEvent, useEffect, useRef, useState } from "react";
import { ActionInput, ActionStatus, ActionTaken, ApiError, Assignee } from "../api.js";
import { ActionStatusBadge, FollowUpBadge } from "./badges.js";
import ConfirmBox from "./ConfirmBox.js";

// docs/lab-04/ui-spec.md §5 — Actions Taken: view mode (list), create mode, edit mode. The same list
// is shown read-only to the Requester (§5.4), where no Add / Edit control is rendered at all.
interface Props {
  load: () => Promise<ActionTaken[]>;
  readOnly?: boolean;
  workable?: boolean; // BR-10 — false on Resolved / Closed / Cancelled tickets
  assignees?: Assignee[];
  currentUserId?: number;
  create?: (input: ActionInput & { clientRequestId: string }) => Promise<ActionTaken>;
  update?: (id: number, input: ActionInput & { version: number }) => Promise<ActionTaken>;
  onChanged?: () => void; // the Ticket's counts and resolution gate depend on the actions
}

const LIMITS = { descriptionMin: 5, description: 1000, result: 2000, followUpNote: 1000, attachmentNotes: 500 };

interface Draft {
  actionAt: string; // datetime-local value (browser local time)
  status: ActionStatus;
  description: string;
  result: string;
  performedById: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function draftFrom(a: ActionTaken): Draft {
  return {
    actionAt: toLocalInput(a.actionAt),
    status: a.status,
    description: a.description,
    result: a.result ?? "",
    performedById: String(a.performedBy.id),
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote ?? "",
    attachmentNotes: a.attachmentNotes ?? "",
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Mirrors BR-04..BR-07 so most mistakes are caught before a round trip; the server stays the
// authority and its 400 field messages land in the same places.
function validate(d: Draft, target: ActionStatus): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.actionAt || Number.isNaN(new Date(d.actionAt).getTime())) errors.actionAt = "Enter a valid date and time.";
  const description = d.description.trim();
  if (description.length < LIMITS.descriptionMin || description.length > LIMITS.description) {
    errors.description = `Description must be ${LIMITS.descriptionMin}-${LIMITS.description} characters.`;
  }
  if (target === "COMPLETED" && !d.result.trim()) errors.result = "Result is required to complete an action.";
  else if (d.result.length > LIMITS.result) errors.result = `Result must be at most ${LIMITS.result} characters.`;
  if (d.followUpRequired && !d.followUpNote.trim()) errors.followUpNote = "Follow-up note is required when follow-up is needed.";
  if (d.attachmentNotes.length > LIMITS.attachmentNotes) errors.attachmentNotes = `Attachment notes must be at most ${LIMITS.attachmentNotes} characters.`;
  return errors;
}

function toInput(d: Draft): ActionInput {
  return {
    actionAt: new Date(d.actionAt).toISOString(),
    description: d.description.trim(),
    result: d.result.trim() || null,
    performedById: Number(d.performedById),
    followUpRequired: d.followUpRequired,
    followUpNote: d.followUpRequired ? d.followUpNote.trim() : null,
    attachmentNotes: d.attachmentNotes.trim() || null,
  };
}

export default function ActionsTaken({ load, readOnly, workable = true, assignees = [], currentUserId, create, update, onChanged }: Props) {
  const [actions, setActions] = useState<ActionTaken[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  async function reload() {
    setLoadError(false);
    try {
      setActions(await load());
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saved(action: ActionTaken, message: string) {
    setActions((prev) => {
      const list = prev ?? [];
      const next = list.some((a) => a.id === action.id) ? list.map((a) => (a.id === action.id ? action : a)) : [...list, action];
      return next.sort((a, b) => new Date(a.actionAt).getTime() - new Date(b.actionAt).getTime() || a.id - b.id); // BR-16
    });
    setCreating(false);
    setEditingId(null);
    setNotice(message);
    onChanged?.();
  }

  const canWrite = !readOnly && workable && Boolean(create && update);

  return (
    <div data-testid="actions-taken">
      {!readOnly && (
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <p className="text-muted small mb-0">
            {workable ? "Record what was done, the result, and whether more work is needed." : "Reopen the ticket to record more actions."}
          </p>
          {canWrite && !creating && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => {
                setCreating(true);
                setEditingId(null);
                setNotice("");
              }}
            >
              + Add Action
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="alert py-2 small" style={{ backgroundColor: "#EAF6EF", color: "#1B2B24" }} role="status">
          {notice}
        </div>
      )}

      {creating && canWrite && (
        <ActionForm
          mode="create"
          assignees={assignees}
          currentUserId={currentUserId}
          onCancel={() => setCreating(false)}
          onSubmit={async (draft, clientRequestId) => {
            const action = await create!({ ...toInput(draft), status: draft.status, clientRequestId });
            saved(action, "Action saved.");
          }}
        />
      )}

      {actions === null && !loadError && (
        <div role="status" className="text-muted small">
          Loading actions…
        </div>
      )}
      {loadError && (
        <div className="alert alert-danger py-2" role="alert">
          Unable to load actions.{" "}
          <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {actions && actions.length === 0 && <p className="text-muted small">No actions recorded yet.</p>}

      {actions && actions.length > 0 && (
        <div className="card shadow-sm">
          <div className="d-none d-md-flex row g-0 px-3 py-2 border-bottom small fw-semibold text-muted" aria-hidden="true">
            <div className="col-md-2">Date/Time</div>
            <div className="col-md-4">Action</div>
            <div className="col-md-3">Result</div>
            <div className="col-md-2">Performed by</div>
            <div className="col-md-1">Status</div>
          </div>
          <ul className="list-unstyled mb-0">
            {actions.map((a) => (
              <li key={a.id} className="px-3 py-2 border-bottom" data-testid={`action-${a.id}`}>
                {editingId === a.id && canWrite ? (
                  <ActionForm
                    mode="edit"
                    action={a}
                    assignees={assignees}
                    currentUserId={currentUserId}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (draft, _id, target) => {
                      const input: ActionInput & { version: number } =
                        target === "CANCELLED" ? { version: a.version, status: "CANCELLED" } : { ...toInput(draft), status: target, version: a.version };
                      const updated = await update!(a.id, input);
                      saved(updated, target === "CANCELLED" ? "Action cancelled." : target === "COMPLETED" ? "Action completed." : "Action updated.");
                    }}
                    onStale={(latest) => setActions((prev) => (prev ?? []).map((x) => (x.id === latest.id ? latest : x)))}
                  />
                ) : (
                  <ActionRow action={a} canEdit={canWrite && (a.status === "PLANNED" || a.status === "IN_PROGRESS")} onEdit={() => {
                    setEditingId(a.id);
                    setCreating(false);
                    setNotice("");
                  }} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActionRow({ action: a, canEdit, onEdit }: { action: ActionTaken; canEdit: boolean; onEdit: () => void }) {
  const when = new Date(a.actionAt).toLocaleString();
  return (
    <div className="row g-2 align-items-start small">
      <div className="col-12 col-md-2">
        <span className="d-md-none fw-semibold text-muted">Date/Time: </span>
        <time dateTime={a.actionAt}>{when}</time>
      </div>
      <div className="col-12 col-md-4" style={{ overflowWrap: "anywhere" }}>
        <div style={{ whiteSpace: "pre-wrap" }}>{a.description}</div>
        {a.followUpRequired && (
          <div className="mt-1">
            <FollowUpBadge /> <span style={{ whiteSpace: "pre-wrap" }}>{a.followUpNote}</span>
          </div>
        )}
        {a.attachmentNotes && (
          <div className="mt-1 text-muted">
            <span aria-hidden="true">📎 </span>
            <span className="visually-hidden">Attachment notes: </span>
            {a.attachmentNotes}
          </div>
        )}
      </div>
      <div className="col-12 col-md-3" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
        <span className="d-md-none fw-semibold text-muted">Result: </span>
        {a.result ?? <span className="text-muted">—</span>}
      </div>
      <div className="col-12 col-md-2">
        <span className="d-md-none fw-semibold text-muted">Performed by: </span>
        {a.performedBy.name}
        {a.createdBy.id !== a.performedBy.id && <div className="text-muted">recorded by {a.createdBy.name}</div>}
      </div>
      <div className="col-12 col-md-1 d-flex flex-md-column gap-2 align-items-start">
        <ActionStatusBadge status={a.status} />
        {canEdit && (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onEdit} aria-label={`Edit action from ${when}`}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

interface FormProps {
  mode: "create" | "edit";
  action?: ActionTaken;
  assignees: Assignee[];
  currentUserId?: number;
  onCancel: () => void;
  onSubmit: (draft: Draft, clientRequestId: string, target: ActionStatus) => Promise<void>;
  onStale?: (latest: ActionTaken) => void;
}

function ActionForm({ mode, action, assignees, currentUserId, onCancel, onSubmit, onStale }: FormProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    action
      ? draftFrom(action)
      : {
          actionAt: toLocalInput(new Date()),
          status: "COMPLETED",
          description: "",
          result: "",
          performedById: currentUserId ? String(currentUserId) : "",
          followUpRequired: false,
          followUpNote: "",
          attachmentNotes: "",
        }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [stale, setStale] = useState<ActionTaken | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const clientRequestId = useRef(newId()); // one per open form (BR-14)
  const prefix = mode === "create" ? "new-action" : `action-${action!.id}`;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const performerOptions = assignees.some((a) => String(a.id) === draft.performedById) || !action
    ? assignees
    : [...assignees, { id: action.performedBy.id, name: `${action.performedBy.name} (inactive)`, role: action.performedBy.role }];

  async function submit(target: ActionStatus) {
    setFailure("");
    if (target !== "CANCELLED") {
      const found = validate(draft, target);
      setErrors(found);
      if (Object.keys(found).length > 0) {
        document.getElementById(`${prefix}-${Object.keys(found)[0]}`)?.focus();
        return;
      }
    }
    setBusy(true);
    try {
      await onSubmit(draft, clientRequestId.current, target);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setErrors(err.fields);
        setFailure(err.fields.status ?? "");
      } else if (err instanceof ApiError && err.code === "STALE_UPDATE" && err.current) {
        setStale(err.current as ActionTaken); // keep the user's draft until they choose (ui-spec §1.5)
        onStale?.(err.current as ActionTaken);
      } else if (err instanceof ApiError && err.status === 409) {
        setFailure(err.message);
      } else {
        setFailure("Unable to save the action right now. Your entries are kept — please try again.");
      }
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(mode === "create" ? draft.status : action!.status);
  }

  const field = (key: keyof Draft) => ({
    id: `${prefix}-${key}`,
    "aria-invalid": Boolean(errors[key]) || undefined,
    "aria-describedby": errors[key] ? `${prefix}-${key}-error` : undefined,
  });
  const invalid = (key: string) => (errors[key] ? " is-invalid" : "");
  const error = (key: string) =>
    errors[key] ? (
      <div id={`${prefix}-${key}-error`} className="invalid-feedback d-block">
        {errors[key]}
      </div>
    ) : null;

  return (
    <form className={mode === "create" ? "card card-body shadow-sm mb-3" : "py-2"} onSubmit={handleSubmit} noValidate aria-label={mode === "create" ? "New action" : "Edit action"}>
      {mode === "create" && <h3 className="h6 mb-3">New action</h3>}
      {stale && (
        <div className="alert py-2 small" style={{ backgroundColor: "#FFF7E6", color: "#1B2B24", borderLeft: "4px solid #B7791F" }} role="alert">
          Someone else changed this action while you were editing (now {stale.status.toLowerCase().replace("_", " ")}, by{" "}
          {stale.performedBy.name}). Your changes are still in the form.
          <div className="mt-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                if (stale.status === "COMPLETED" || stale.status === "CANCELLED") onCancel();
                else {
                  setDraft(draftFrom(stale));
                  setStale(null);
                  setErrors({});
                }
              }}
            >
              Use latest
            </button>
          </div>
        </div>
      )}
      {failure && (
        <div className="alert alert-danger py-2 small" role="alert">
          {failure}
        </div>
      )}
      <div className="row g-3">
        <div className="col-md-6 col-lg-4">
          <label htmlFor={`${prefix}-actionAt`} className="form-label fw-semibold small">
            Action Date/Time
          </label>
          <input type="datetime-local" className={"form-control" + invalid("actionAt")} {...field("actionAt")} value={draft.actionAt} onChange={(e) => set("actionAt", e.target.value)} disabled={busy} />
          {error("actionAt")}
        </div>
        {mode === "create" ? (
          <div className="col-md-6 col-lg-4">
            <label htmlFor={`${prefix}-status`} className="form-label fw-semibold small">
              Status
            </label>
            <select className={"form-select" + invalid("status")} {...field("status")} value={draft.status} onChange={(e) => set("status", e.target.value as ActionStatus)} disabled={busy}>
              <option value="COMPLETED">Completed</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="PLANNED">Planned</option>
            </select>
            {error("status")}
          </div>
        ) : (
          <div className="col-md-6 col-lg-4">
            <span className="form-label fw-semibold small d-block">Status</span>
            <ActionStatusBadge status={action!.status} />
          </div>
        )}
        <div className="col-md-6 col-lg-4">
          <label htmlFor={`${prefix}-performedById`} className="form-label fw-semibold small">
            Performed by
          </label>
          <select className={"form-select" + invalid("performedById")} {...field("performedById")} value={draft.performedById} onChange={(e) => set("performedById", e.target.value)} disabled={busy}>
            {performerOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.id === currentUserId ? " (me)" : ""}
              </option>
            ))}
          </select>
          {error("performedById")}
        </div>
        <div className="col-12">
          <label htmlFor={`${prefix}-description`} className="form-label fw-semibold small">
            Action Description
          </label>
          <textarea className={"form-control" + invalid("description")} rows={2} maxLength={LIMITS.description} {...field("description")} value={draft.description} onChange={(e) => set("description", e.target.value)} disabled={busy} />
          {error("description")}
          <div className="form-text">{draft.description.length}/{LIMITS.description}</div>
        </div>
        <div className="col-12">
          <label htmlFor={`${prefix}-result`} className="form-label fw-semibold small">
            Result <span className="text-muted fw-normal">(required to complete)</span>
          </label>
          <textarea className={"form-control" + invalid("result")} rows={2} maxLength={LIMITS.result} {...field("result")} value={draft.result} onChange={(e) => set("result", e.target.value)} disabled={busy} />
          {error("result")}
        </div>
        <div className="col-12">
          <div className="form-check">
            <input type="checkbox" className="form-check-input" id={`${prefix}-followUpRequired`} checked={draft.followUpRequired} onChange={(e) => set("followUpRequired", e.target.checked)} disabled={busy} />
            <label htmlFor={`${prefix}-followUpRequired`} className="form-check-label small fw-semibold">
              Follow-Up Required?
            </label>
          </div>
        </div>
        {draft.followUpRequired && (
          <div className="col-12">
            <label htmlFor={`${prefix}-followUpNote`} className="form-label fw-semibold small">
              Follow-up Note <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <textarea className={"form-control" + invalid("followUpNote")} rows={2} maxLength={LIMITS.followUpNote} required aria-required="true" {...field("followUpNote")} value={draft.followUpNote} onChange={(e) => set("followUpNote", e.target.value)} disabled={busy} />
            {error("followUpNote")}
          </div>
        )}
        <div className="col-12">
          <label htmlFor={`${prefix}-attachmentNotes`} className="form-label fw-semibold small">
            Attachment Notes
          </label>
          <input className={"form-control" + invalid("attachmentNotes")} maxLength={LIMITS.attachmentNotes} {...field("attachmentNotes")} value={draft.attachmentNotes} onChange={(e) => set("attachmentNotes", e.target.value)} disabled={busy} />
          {error("attachmentNotes")}
          <div className="form-text">Which file or image to look at, e.g. "see screenshot error.png in Attachments".</div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mt-3">
        <button type="submit" className="btn btn-success btn-sm" disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Save Action" : "Save Changes"}
        </button>
        {mode === "edit" && action!.status === "PLANNED" && (
          <button type="button" className="btn btn-outline-success btn-sm" onClick={() => submit("IN_PROGRESS")} disabled={busy}>
            Start
          </button>
        )}
        {mode === "edit" && (
          <button type="button" className="btn btn-outline-success btn-sm" onClick={() => submit("COMPLETED")} disabled={busy}>
            Complete
          </button>
        )}
        {mode === "edit" && (
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setConfirmCancel(true)} disabled={busy || confirmCancel}>
            Cancel Action
          </button>
        )}
        <button type="button" className="btn btn-outline-secondary btn-sm ms-md-auto" onClick={onCancel} disabled={busy}>
          {mode === "create" ? "Cancel" : "Close"}
        </button>
      </div>
      {confirmCancel && (
        <ConfirmBox
          title="Cancel this action?"
          message="A cancelled action cannot be changed again. Record a new action if the work is needed later."
          confirmLabel="Yes, cancel the action"
          danger
          busy={busy}
          onConfirm={() => submit("CANCELLED")}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </form>
  );
}
