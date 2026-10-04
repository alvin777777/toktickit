import { FormEvent, useEffect, useRef, useState } from "react";
import { AdminUser, ApiError, Role, createUser, getUsers, setInitialPassword, updateUser } from "../api.js";
import { ROLE_LABEL, useAuth } from "../context/AuthContext.js";
import { ROLE_BADGE } from "../components/AppShell.js";
import PasswordInput from "../components/PasswordInput.js";
import ConfirmBox from "../components/ConfirmBox.js";

type LoadState = "loading" | "success" | "error";
type PanelMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; user: AdminUser };

const ROLES: Role[] = ["REQUESTER", "IT_STAFF", "ADMIN"];
const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 && p.length <= 72 },
  { id: "case", label: "Upper and lower case letters", test: (p: string) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { id: "digit", label: "At least one number", test: (p: string) => /[0-9]/.test(p) },
];

// ui-spec.md §8 — Administrator User Management (FR-20..FR-24).
export default function UserManagement() {
  const { user: me } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [panel, setPanel] = useState<PanelMode>({ kind: "closed" });
  const [flash, setFlash] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, role]);

  async function load() {
    const requestId = ++requestIdRef.current;
    setLoadState("loading");
    try {
      const result = await getUsers({ search: search || undefined, role: role || undefined });
      if (requestId !== requestIdRef.current) return;
      setUsers(result);
      setLoadState("success");
    } catch {
      if (requestId !== requestIdRef.current) return;
      setLoadState("error");
    }
  }

  function upsertInList(saved: AdminUser) {
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === saved.id);
      const next = exists ? prev.map((u) => (u.id === saved.id ? saved : u)) : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.isActive);
  const filtersActive = Boolean(search || role);

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1200 }}>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Users</h1>
          <p className="text-muted small mb-0">Create accounts, assign one role, and activate or deactivate access.</p>
        </div>
        <button className="btn btn-success" onClick={() => setPanel({ kind: "create" })} disabled={panel.kind === "create"}>
          + Create User
        </button>
      </div>

      {flash && (
        <div className="alert py-2" style={{ backgroundColor: "#EAF6EF", color: "#1B2B24" }} role="status">
          {flash}
        </div>
      )}

      <div className="row g-3">
        <div className={panel.kind === "closed" ? "col-12" : "col-12 col-lg-7"}>
          <div className="row g-2 mb-3">
            <div className="col-12 col-md-7">
              <input
                type="search"
                className="form-control"
                placeholder="Search users by name or email…"
                aria-label="Search users"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="col-8 col-md-3">
              <select className="form-select" aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">All roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-4 col-md-2">
              <button
                className="btn btn-outline-secondary w-100"
                onClick={() => {
                  setSearch("");
                  setRole("");
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {loadState === "loading" && (
            <div role="status" className="placeholder-glow py-3" aria-label="Loading users">
              {[0, 1, 2].map((i) => (
                <span key={i} className="placeholder col-12 mb-2" style={{ height: 40, display: "block", borderRadius: 4 }} />
              ))}
              <span className="visually-hidden">Loading users…</span>
            </div>
          )}
          {loadState === "error" && (
            <div className="alert alert-danger" role="alert">
              Unable to load users. Please try again.
              <div className="mt-2">
                <button className="btn btn-sm btn-outline-danger" onClick={load}>
                  Retry
                </button>
              </div>
            </div>
          )}
          {loadState === "success" && users.length === 0 && (
            <div className="text-center py-5" data-testid="users-no-results">
              <p className="text-muted mb-3">{filtersActive ? "No users match your filters." : "No users yet."}</p>
              {filtersActive && (
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setSearch("");
                    setRole("");
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {loadState === "success" && users.length > 0 && (
            <>
              <div className="table-responsive d-none d-lg-block" data-testid="users-table">
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="visually-hidden">Edit</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td className="text-break">{u.email}</td>
                        <td>
                          <span className={`badge ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                        </td>
                        <td>
                          <UserStatus user={u} />
                        </td>
                        <td className="text-end">
                          <button className="btn btn-link btn-sm p-0" onClick={() => setPanel({ kind: "edit", user: u })} aria-label={`Edit ${u.name}`}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="d-lg-none" data-testid="users-cards">
                {users.map((u) => (
                  <div key={u.id} className="card mb-2">
                    <div className="card-body d-flex justify-content-between align-items-start gap-2">
                      <div>
                        <strong>{u.name}</strong>
                        <div className="text-muted small text-break">{u.email}</div>
                        <div className="d-flex gap-1 mt-1 flex-wrap">
                          <span className={`badge ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                          <UserStatus user={u} />
                        </div>
                      </div>
                      <button className="btn btn-outline-secondary btn-sm" onClick={() => setPanel({ kind: "edit", user: u })} aria-label={`Edit ${u.name}`}>
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-muted small mb-0">{users.length} users</p>
            </>
          )}
        </div>

        {panel.kind !== "closed" && (
          <div className="col-12 col-lg-5">
            <UserPanel
              key={panel.kind === "edit" ? panel.user.id : "create"}
              mode={panel}
              meId={me?.id ?? 0}
              isLastActiveAdmin={(u: AdminUser) => u.role === "ADMIN" && u.isActive && activeAdmins.length <= 1}
              onClose={() => setPanel({ kind: "closed" })}
              onSaved={(saved, message) => {
                upsertInList(saved);
                setFlash(message);
                setPanel({ kind: "closed" });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function UserStatus({ user }: { user: AdminUser }) {
  return (
    <>
      <span className={`badge ${user.isActive ? "bg-success" : "bg-secondary"}`}>{user.isActive ? "Active" : "Inactive"}</span>
      {user.mustChangePassword && (
        <span className="text-muted small ms-1" title="Password change pending">
          🔑 Password change pending
        </span>
      )}
    </>
  );
}

interface PanelProps {
  mode: { kind: "create" } | { kind: "edit"; user: AdminUser };
  meId: number;
  isLastActiveAdmin: (u: AdminUser) => boolean;
  onClose: () => void;
  onSaved: (user: AdminUser, message: string) => void;
}

// ui-spec.md §8 — Create / Edit side panel.
function UserPanel({ mode, meId, isLastActiveAdmin, onClose, onSaved }: PanelProps) {
  const editing = mode.kind === "edit" ? mode.user : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [role, setRole] = useState<Role>(editing?.role ?? "REQUESTER");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [initialPassword, setInitialPasswordInput] = useState(""); // (the API call is setInitialPassword)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [panelError, setPanelError] = useState("");
  const [saving, setSaving] = useState(false);

  // Set Initial Password (edit mode only)
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const isSelf = editing?.id === meId;
  const lastAdmin = editing ? isLastActiveAdmin(editing) : false;
  const activeLocked = isSelf || lastAdmin;
  const roleLocked = lastAdmin;

  function describe(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 400) {
      setFieldErrors(err.fields);
      return "";
    }
    if (err instanceof ApiError && err.status === 409) {
      if (err.code === "EMAIL_TAKEN") {
        setFieldErrors({ email: err.fields.email ?? err.message });
        return "";
      }
      return err.message;
    }
    return fallback;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPanelError("");
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "Name must be 2-100 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!editing && !PASSWORD_RULES.every((r) => r.test(initialPassword))) {
      errors.initialPassword = "Password must be 8-72 characters and include an uppercase letter, a lowercase letter, and a number.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        const saved = await updateUser(editing.id, { name: name.trim(), email: email.trim().toLowerCase(), role, isActive });
        onSaved(saved, `User ${saved.name} saved.`);
      } else {
        const saved = await createUser({ name: name.trim(), email: email.trim().toLowerCase(), role, isActive, initialPassword });
        onSaved(saved, `User ${saved.name} created. They must change the initial password at first login.`);
      }
    } catch (err) {
      const msg = describe(err, "Unable to save the user right now. Your entries have been kept — please try again.");
      if (msg) setPanelError(msg);
    } finally {
      setSaving(false);
    }
  }

  function requestReset() {
    setResetError("");
    if (!PASSWORD_RULES.every((r) => r.test(resetPassword))) {
      setResetError("Password must be 8-72 characters and include an uppercase letter, a lowercase letter, and a number.");
      return;
    }
    setConfirmReset(true);
  }

  async function commitReset() {
    if (!editing) return;
    setResetBusy(true);
    try {
      const saved = await setInitialPassword(editing.id, resetPassword);
      onSaved(saved, `Initial password set for ${saved.name}. They were signed out and must change it at next login.`);
    } catch (err) {
      setResetError(err instanceof ApiError && err.status === 400 ? err.fields.initialPassword ?? err.message : "Unable to set the initial password right now. Please try again.");
      setConfirmReset(false);
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="card shadow-sm" data-testid="user-panel">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h5 mb-0">{editing ? `Edit User` : "Create New User"}</h2>
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>

        {panelError && (
          <div className="alert alert-danger py-2" role="alert">
            {panelError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="user-name" className="form-label fw-semibold">
              Full Name <span className="text-danger">*</span>
            </label>
            <input id="user-name" className={"form-control" + (fieldErrors.name ? " is-invalid" : "")} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} maxLength={100} />
            {fieldErrors.name && <div className="invalid-feedback">{fieldErrors.name}</div>}
          </div>
          <div className="mb-3">
            <label htmlFor="user-email" className="form-label fw-semibold">
              Email Address <span className="text-danger">*</span>
            </label>
            <input id="user-email" type="email" className={"form-control" + (fieldErrors.email ? " is-invalid" : "")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
            {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
          </div>
          <div className="mb-3">
            <label htmlFor="user-role" className="form-label fw-semibold">
              Role <span className="text-danger">*</span>
            </label>
            <select id="user-role" className={"form-select" + (fieldErrors.role ? " is-invalid" : "")} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={saving || roleLocked}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {fieldErrors.role && <div className="invalid-feedback">{fieldErrors.role}</div>}
            {roleLocked && <div className="form-text">At least one active Administrator is required.</div>}
          </div>
          <div className="mb-3 form-check form-switch">
            <input id="user-active" className="form-check-input" type="checkbox" role="switch" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={saving || activeLocked} />
            <label htmlFor="user-active" className="form-check-label fw-semibold">
              Active
            </label>
            {isSelf && <div className="form-text">You cannot deactivate your own account.</div>}
            {!isSelf && lastAdmin && <div className="form-text">At least one active Administrator is required.</div>}
          </div>

          {!editing && (
            <div className="mb-3 border rounded p-3">
              <PasswordInput id="user-initial-password" label="Initial Password" autoComplete="new-password" value={initialPassword} onChange={setInitialPasswordInput} error={fieldErrors.initialPassword} disabled={saving} />
              <ul className="list-unstyled small mb-0 mt-2" aria-label="Password rules">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(initialPassword);
                  return (
                    <li key={rule.id} className={ok ? "text-success" : "text-muted"}>
                      {ok ? "✓" : "○"} {rule.label}
                    </li>
                  );
                })}
              </ul>
              <div className="form-text">The user must change this password at first login.</div>
            </div>
          )}

          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-success" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Save User"}
            </button>
          </div>
        </form>

        {editing && (
          <div className="border rounded p-3 mt-4" data-testid="initial-password-section">
            <h3 className="h6">Set Initial Password</h3>
            <PasswordInput id="user-reset-password" label="New initial password" autoComplete="new-password" value={resetPassword} onChange={setResetPassword} error={resetError} disabled={resetBusy} />
            <div className="form-text mb-2">The user will be signed out and must change this password at next login.</div>
            {!confirmReset && (
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={requestReset} disabled={resetBusy}>
                Set Password
              </button>
            )}
            {confirmReset && (
              <ConfirmBox
                title={`Set a new initial password for ${editing.name}?`}
                message="The user will be signed out and must change this password at next login."
                confirmLabel="Yes, set password"
                busy={resetBusy}
                onConfirm={commitReset}
                onCancel={() => setConfirmReset(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
