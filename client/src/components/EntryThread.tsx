import { FormEvent, useEffect, useState } from "react";
import { Entry } from "../api.js";
import { ROLE_LABEL } from "../context/AuthContext.js";

interface Props {
  kind: "comment" | "note";
  load: () => Promise<Entry[]>;
  post: (body: string) => Promise<Entry>;
  disabledReason?: string; // when set, the composer is disabled and this note is shown (BR-38)
  testId?: string;
}

const MAX = 2000;

// ui-spec.md §5 / §7 — append-only thread used for Public Comments (white surface) and Internal
// Notes (amber private surface, §1.4). Author/time come from the server (BR-36); content is
// rendered as plain text (BR-37).
export default function EntryThread({ kind, load, post, disabledReason, testId }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const isNote = kind === "note";

  async function reload() {
    setLoadError(false);
    try {
      setEntries(await load());
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPostError("");
    const body = draft.trim();
    if (!body) {
      setPostError(isNote ? "Enter a note before posting." : "Enter a comment before posting.");
      return;
    }
    setPosting(true);
    try {
      const created = await post(body);
      setEntries((prev) => [...(prev ?? []), created]);
      setDraft("");
    } catch (err) {
      const msg = err instanceof Error && "status" in err && (err as { status: number }).status === 409
        ? err.message
        : `Unable to post your ${isNote ? "note" : "comment"} right now. Please try again.`;
      setPostError(msg);
    } finally {
      setPosting(false);
    }
  }

  const label = isNote ? "Add internal note (not visible to the requester)" : "Add a public comment";
  const surface = isNote ? { backgroundColor: "#FFF7E6", borderLeft: "4px solid #B7791F" } : undefined;

  return (
    <div className="p-3 rounded" style={surface} data-testid={testId}>
      {isNote && (
        <p className="small fw-semibold mb-2" style={{ color: "#B7791F" }}>
          🔒 Internal — not visible to the requester
        </p>
      )}

      {entries === null && !loadError && (
        <div role="status" className="text-muted small">
          Loading…
        </div>
      )}
      {loadError && (
        <div className="alert alert-danger py-2" role="alert">
          Unable to load {isNote ? "internal notes" : "comments"}.{" "}
          <button className="btn btn-sm btn-outline-danger ms-2" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {entries && entries.length === 0 && <p className="text-muted small">No {isNote ? "internal notes" : "comments"} yet.</p>}

      <ul className="list-unstyled mb-3">
        {(entries ?? []).map((e) => (
          <li key={e.id} className="mb-2 pb-2 border-bottom">
            <div className="d-flex align-items-center gap-2 small">
              <strong>{e.author.name}</strong>
              <span className="badge bg-light text-dark border">{ROLE_LABEL[e.author.role]}</span>
              <span className="text-muted ms-auto">{new Date(e.createdAt).toLocaleString()}</span>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{e.body}</div>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor={`${kind}-draft`} className="form-label fw-semibold small">
          {label}
        </label>
        <textarea
          id={`${kind}-draft`}
          className={"form-control" + (postError ? " is-invalid" : "")}
          rows={3}
          maxLength={MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={posting || Boolean(disabledReason)}
        />
        {postError && <div className="invalid-feedback d-block">{postError}</div>}
        <div className="d-flex justify-content-between align-items-center mt-2">
          <span className="text-muted small">
            {disabledReason ?? `${draft.length}/${MAX}`}
          </span>
          <button type="submit" className="btn btn-success btn-sm" disabled={posting || Boolean(disabledReason)}>
            {posting ? "Posting…" : isNote ? "Add Note" : "Post Comment"}
          </button>
        </div>
      </form>
    </div>
  );
}
