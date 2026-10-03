# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with real email/password authentication and
server-side role-based authorization, so that TokTickIT supports three real roles: a **Requester**
keeps using every Lab 2 ticket function from their authenticated identity (plus Public Comments and
a "Problem Appears Resolved" signal); **IT Staff** get an operational Ticket Queue and Ticket Detail
where they claim/reassign Tickets, set IT Priority, move Tickets through a permitted status
workflow, talk to the Requester through Public Comments, and keep private Internal Notes; and an
**Administrator** manages user accounts through one minimalist User Management screen.

## 2. Stakeholder Request Interpretation

The stakeholder's concern is trust: the system must now know *who* is acting, and every screen and
API must be protected by that identity and its role — "hiding a button is not authorization". The
Lab 2 increment must keep working unchanged for Requesters, but the current Requester must come
from the authenticated session, never from the client. IT Staff need a professional, searchable
queue and a detail screen that separates public conversation from private operational notes. The
Administrator screen is intentionally minimal: list, create, edit basics, one role, activate or
deactivate, set an initial password that must be changed at next login. Users signing in with an
initial password must change it before entering the application.

## 3. Scope

### Included
- Email/password login, logout, current-user retrieval, mandatory first-login password change
- Server-side sessions (httpOnly cookie), scrypt password hashing, safe error responses
- Migration of Lab 2 `RequesterUser` rows into the real `User` model with roles, keeping every
  existing Ticket/Attachment and its ownership intact
- Role-based navigation and server-side authorization for Requester, IT Staff, Administrator
- Removal of the Development Requester selector, the `X-Requester-Id` header, and all client-side
  requester state
- Requester regression: Create Ticket, My Tickets, Ticket Detail, Attachments from the session
- Public Comments (Requester, IT Staff, Administrator) and Internal Notes (IT Staff, Administrator)
- Requester "Problem Appears Resolved" indication
- IT Staff Ticket Queue (search, filters, sorting, pagination, ownership/status visibility)
- IT Staff Ticket Detail: claim / assign / reassign ownership, IT Priority, permitted status
  transitions, Public Comments, Internal Notes, existing Attachments (view/download)
- Administrator User Management: list, search, optional role filter, create, edit basics, one role,
  activate/deactivate, set a new initial password, safety rules
- Seed data for all three roles and a realistic ticket mix; E2E, responsive, and visual QA

### Excluded (explicitly out of scope for Lab 3)
- Email invitations, password-reset email, MFA, social login, SSO, self-registration
- Actions Taken by IT Staff (Lab 4), SLA calculation, escalation, notifications
- Dashboards/KPI analytics beyond the queue's simple counts
- Multi-tenant organizations, departments, profile photos, extended user profiles
- Multiple roles per user, user deletion, bulk user operations, import/export, account history,
  role history, account unlocking, approval workflows, login-attempt lockout
- User-list pagination, multi-column sorting, multiple simultaneous user-list filters
- Editing or deleting Public Comments / Internal Notes (append-only in Lab 3)
- Production deployment / cloud infrastructure changes

## 4. Functional Requirements

### Authentication
- **FR-01** A user authenticates with an email address and password on the Login screen; on success
  the backend establishes an authenticated session and returns the user's identity and role.
- **FR-02** A user can log out; the session is invalidated server-side and the browser can no longer
  reach any protected screen or API with the old session.
- **FR-03** The client can retrieve the current authenticated user (`GET /api/auth/me`) to restore
  the application shell after a page reload.
- **FR-04** A user whose account is flagged "must change password" is taken to the Change Password
  screen immediately after login and cannot use any other screen or API until a valid new password
  is saved.
- **FR-05** Any authenticated user can change their own password from the application shell.

### Authorization and shell
- **FR-06** The application shell shows the authenticated user's name and role badge, a Logout action,
  and a Change Password action, and shows only the navigation destinations permitted for the role.
- **FR-07** Every protected API endpoint enforces role and ownership on the server, independent of
  what the UI shows; unauthenticated requests get 401, authenticated-but-forbidden requests get 403.
- **FR-08** The Lab 2 Development Requester Selection screen, Change Requester action,
  `X-Requester-Id` header, and `GET /api/requesters` are removed.

### Requester
- **FR-09** A Requester can create Tickets, list My Tickets, open owned Ticket Detail, and add,
  download, and remove Attachments exactly as in Lab 2, with the Requester identity taken from the
  session.
- **FR-10** A Requester can read and post Public Comments on their own Tickets from Ticket Detail.
- **FR-11** A Requester can indicate that the reported problem appears resolved; the indication is
  shown to IT Staff but does not change the Ticket's status.
- **FR-12** Requester Ticket Detail shows the Ticket Owner (name) and IT Priority read-only, and the
  "appears resolved" indication once given.

### IT Staff
- **FR-13** IT Staff (and Administrators, per the authorization matrix) can view a shared Ticket Queue
  of all Tickets with search, filters (status, IT Priority, category, owner incl. Unassigned / Mine),
  column sorting, and pagination, plus simple counts (all / unassigned / mine).
- **FR-14** IT Staff can open any Ticket's IT Staff Ticket Detail showing grouped read-only ticket
  information, Requester, existing Attachments (download), and the operational fields.
- **FR-15** IT Staff can claim an unassigned Ticket, assign or reassign it to any active IT Staff /
  Administrator, or unassign it.
- **FR-16** IT Staff can change a Ticket's IT Priority (LOW / MEDIUM / HIGH).
- **FR-17** IT Staff can change a Ticket's status only along the permitted transitions in BR-30;
  the UI offers only permitted targets and asks for confirmation on Closed and Cancelled.
- **FR-18** IT Staff can read and post Public Comments on any Ticket.
- **FR-19** IT Staff can read and create Internal Notes on any Ticket; Internal Notes are never
  returned to a Requester.

### Administrator
- **FR-20** An Administrator can view the user list (Name, Email, Role, Status, Edit), search by name
  or email, and optionally filter by one role.
- **FR-21** An Administrator can create a user with name, email, one role, activation state, and an
  initial password; the user must change that password at first login.
- **FR-22** An Administrator can edit a user's name, email, role, and activation state.
- **FR-23** An Administrator can set a new initial password for a user, which must be changed at the
  user's next login and ends that user's existing sessions.
- **FR-24** All Administrator operations enforce the safety rules in BR-40..BR-45 on the server.

## 5. Business Rules

### Authentication and passwords
- **BR-01** Only an active user with valid credentials may authenticate. Login with an unknown
  email or a wrong password returns the same safe message ("Invalid email or password."); the
  response never reveals whether the email exists.
- **BR-02** An inactive user who presents *correct* credentials receives a distinct, clear response
  ("This account is inactive. Contact an administrator.") so a deactivated colleague is not left
  guessing; an inactive user with wrong credentials receives the BR-01 message (no existence leak).
- **BR-03** Email addresses are case-insensitive: they are trimmed and lower-cased on login, create,
  and edit, and uniqueness is enforced on the normalized value.
- **BR-04** Passwords are never stored or logged in plaintext. They are hashed with Node's built-in
  `scrypt` (random 16-byte salt, N=16384, r=8, p=1, 64-byte key) and compared with a
  timing-safe comparison. Hash strings are self-describing (`scrypt$N$r$p$salt$hash`).
- **BR-05** A valid password is 8–72 characters and contains at least one uppercase letter, one
  lowercase letter, and one digit. The same rule applies to initial passwords set by an
  Administrator and to new passwords chosen by a user.
- **BR-06** A user flagged `mustChangePassword` cannot use any endpoint other than
  `GET /api/auth/me`, `POST /api/auth/logout`, and `POST /api/auth/change-password` until a new
  valid password is saved; other endpoints return 403 `PASSWORD_CHANGE_REQUIRED`. The UI redirects
  such a user to Change Password from every route.
- **BR-07** Changing a password requires the current password, a new password satisfying BR-05
  that differs from the current one, and a matching confirmation. Success clears
  `mustChangePassword` and ends every *other* session of that user (the current session stays).
- **BR-08** Sessions are server-side rows: an opaque 256-bit random token is issued in an `httpOnly`,
  `SameSite=Lax`, `Path=/` cookie (`Secure` outside development) and only its SHA-256 hash is stored.
  A session expires 8 hours after login. Expired, revoked, or unknown sessions are treated as
  unauthenticated (401) and the cookie is cleared.
- **BR-09** Logout deletes the session row, so a replayed cookie is rejected afterwards. Logout
  always succeeds (204), even without a valid session.
- **BR-10** When a user is deactivated, or an Administrator sets a new initial password for them,
  all of that user's sessions are deleted immediately; their next request is a 401.
- **BR-11** Login-attempt lockout, rate limiting, and account unlocking are out of scope (§3); the
  constant-cost password check and uniform error message are the Lab 3 mitigation.

### Authorization
- **BR-12** Each user has exactly one role: `REQUESTER`, `IT_STAFF`, or `ADMIN`.
- **BR-13** The authenticated session, never a client-supplied `requesterId`, determines ownership of
  Requester operations. Any `requesterId`/`X-Requester-Id` sent by a client is ignored.
- **BR-14** Authorization matrix (enforced by backend middleware + ownership queries; the UI mirrors
  it but is not the control):

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| Login, logout, current user, change own password | ✓ | ✓ | ✓ |
| Categories / Related Systems lookups | ✓ | ✓ | ✓ |
| Create Ticket; My Tickets; own Ticket Detail; add/remove/download own Attachments | ✓ (own only) | ✗ | ✗ |
| Read/post Public Comments | ✓ own Tickets | ✓ any | ✓ any |
| "Problem Appears Resolved" | ✓ own Tickets | ✗ | ✗ |
| Ticket Queue; IT Staff Ticket Detail; download any Ticket's Attachments | ✗ | ✓ | ✓ |
| Claim / assign / reassign / unassign; IT Priority; status transitions | ✗ | ✓ | ✓ |
| Read/create Internal Notes | ✗ | ✓ | ✓ |
| User Management (list, create, edit, activate/deactivate, initial password) | ✗ | ✗ | ✓ |

- **BR-15** Decision: an Administrator is explicitly permitted the IT Staff Ticket operations above,
  because the handout allows an Administrator to be a Ticket Owner (§4.5) and Internal Notes are
  visible to Administrators (BR-04 of the handout). IT Staff never gain Administrator operations.
- **BR-16** Failure codes are distinguished consistently: 401 unauthenticated; 403 authenticated but
  not permitted (or password change required, or inactive); 400 invalid input; 404 missing (or, for
  Requester-scoped resources, not owned — BR-17); 409 conflict; 500 unexpected with a safe message.
- **BR-17** Requester-scoped lookups keep the Lab 2 rule: a Ticket/Attachment that does not exist and
  one owned by another Requester return the identical 404, never confirming existence.
- **BR-18** Internal Note endpoints reject a Requester with 403 before any Ticket lookup, so neither
  note content nor Ticket existence is exposed.

### Users and administration
- **BR-19** Name is required, trimmed, 2–100 characters. Email is required, trimmed, lower-cased,
  a syntactically valid address, at most 254 characters, and unique (BR-03).
- **BR-20** New users created by an Administrator always start with `mustChangePassword = true`.
- **BR-21** Users are never deleted in Lab 3; deactivation is the only way to retire an account.
- **BR-22** A deactivated IT Staff / Administrator keeps the Tickets they already own (history stays
  correct) but can no longer be chosen as an assignee; the queue shows the owner name as usual.

### Tickets, ownership, priority, status
- **BR-23** A Ticket has zero or one Ticket Owner, who must be an *active* `IT_STAFF` or `ADMIN` user
  at the moment of assignment. A new Ticket is unassigned.
- **BR-24** Requested Priority stays exactly as the Requester submitted it. IT Priority is created
  equal to Requested Priority and may afterwards be changed only by IT Staff / Administrator.
- **BR-25** Ticket statuses: `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`,
  `CLOSED`, `REOPENED`, `CANCELLED`. A new Ticket starts in `NEW`.
- **BR-26** Claiming (or assigning) a `NEW` Ticket automatically moves it to `OPEN`; every other
  status is left unchanged by ownership changes.
- **BR-27** "Claim" sets the caller as owner of an *unassigned* Ticket; if the Ticket already has a
  different owner the claim is rejected (409 `ALREADY_ASSIGNED`) and the UI offers Reassign instead.
- **BR-28** Ownership, IT Priority, and status cannot be changed on a `CLOSED` or `CANCELLED` Ticket
  except the `CLOSED → REOPENED` transition (409 `TICKET_TERMINAL` otherwise).
- **BR-29** A Ticket cannot enter `RESOLVED` without a Ticket Owner (409 `OWNER_REQUIRED`).
- **BR-30** Permitted status transitions (IT Staff / Administrator only; any other request is
  409 `INVALID_TRANSITION` listing the permitted targets):

| From | Permitted targets |
|---|---|
| NEW | OPEN, CANCELLED |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, CANCELLED |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| WAITING_FOR_REQUESTER | IN_PROGRESS, RESOLVED, CANCELLED |
| RESOLVED | CLOSED, REOPENED |
| REOPENED | IN_PROGRESS, RESOLVED, CANCELLED |
| CLOSED | REOPENED |
| CANCELLED | — (terminal) |

- **BR-31** `CLOSED` and `CANCELLED` require an explicit confirmation in the UI before the API call.
- **BR-32** A Requester may mark a Ticket "appears resolved" only on their own Ticket whose status is
  not `RESOLVED`, `CLOSED`, or `CANCELLED`, and only once (409 `ALREADY_INDICATED` afterwards); it
  records `requesterResolvedAt` and never changes status (handout BR-05). IT Staff see the
  indication in the queue and detail; Resolved/Closed remain IT Staff decisions.
- **BR-33** My Tickets' status filter accepts every BR-25 status; the Lab 2 default sort/paging rules
  (BR-12/BR-13 of Lab 2) are unchanged.
- **BR-34** Queue query rules: `search` matches Ticket Number, Summary, or Requester name
  (case-insensitive substring); filters `status`, `itPriority`, `categoryId`, `owner`
  (`unassigned` | `me` | user id); `sortBy` ∈ {`createdAt`, `updatedAt`, `itPriority`,
  `currentStatus`, `ticketNumber`} (default `createdAt`), `sortDir` (default `desc`); `page` ≥ 1
  (default 1), `pageSize` 1–50 (default 10). Invalid values fall back to defaults, never error.

### Comments and notes
- **BR-35** Public Comments are visible to the Ticket's Requester, IT Staff, and Administrators.
  Internal Notes are visible only to IT Staff and Administrators.
- **BR-36** Both are append-only: no editing or deletion. Author and creation time are set by the
  backend from the session and server clock, never accepted from the client.
- **BR-37** Content is trimmed and must be 1–2000 characters; empty or whitespace-only content is
  rejected (400). Content is rendered as plain text (React escaping; newlines preserved with
  `white-space: pre-wrap`), never as HTML.
- **BR-38** Public Comments cannot be posted on a `CLOSED` or `CANCELLED` Ticket (409
  `TICKET_NOT_COMMENTABLE`); Internal Notes can always be added.
- **BR-39** Comments and notes are listed oldest-first with the author's name and role.

### Administrator safety rules
- **BR-40** Creating or editing a user with an email already used by another user is rejected with
  409 `EMAIL_TAKEN`.
- **BR-41** Role values outside BR-12 are rejected with 400.
- **BR-42** An Administrator cannot deactivate their own account (409 `SELF_DEACTIVATION`).
- **BR-43** The system must always keep at least one active Administrator: deactivating the last
  active Administrator, or changing their role, is rejected (409 `LAST_ADMIN`).
- **BR-44** Setting a new initial password sets `mustChangePassword = true`, replaces the hash, and
  deletes the user's sessions (BR-10). The Administrator types the initial password (no email
  delivery in Lab 3) and communicates it out of band; the API never returns it.
- **BR-45** User deletion, bulk operations, and import/export are not provided.

### Migration and regression
- **BR-46** `RequesterUser` becomes `User` by renaming the table in place (no row copy), so every
  `Ticket.requesterId` keeps pointing at the same ids. Migrated users get `role = REQUESTER`,
  `mustChangePassword = true`, and the documented local-lab initial password `Welcome123!`
  (hash precomputed in the migration), so they are forced to choose their own password at first
  login. `isActive` is preserved.
- **BR-47** Existing Tickets get `itPriority` back-filled from `requestedPriority` and
  `ownerId = NULL`; existing `NEW` statuses are preserved; Attachments are untouched.
- **BR-48** Every Lab 2 Acceptance Criterion remains covered by a test that now authenticates via
  session cookie instead of `X-Requester-Id` (regression suite in `tests.md` §2).

## 6. UI Specification Summary

Full detail in `docs/lab-03/ui-spec.md`. Summary:
- **Login** (`/login`): centered Zen Green card with email + password, validation, busy state, safe
  failure banner, inactive-account banner. **Change Password** (`/change-password`): current, new,
  confirm, live rule checklist, Continue.
- **Application shell:** TokTickIT identity, role-specific nav (Requester: My Tickets, Create Ticket;
  IT Staff: Ticket Queue; Administrator: Ticket Queue, Users), user name + role badge, Change
  Password, Logout; hamburger on mobile.
- **Requester screens:** Lab 2 screens unchanged except the selector is gone; Ticket Detail gains
  Ticket Owner / IT Priority read-only fields, a Public Comments section, and the "Problem Appears
  Resolved" action.
- **Ticket Queue** (`/staff/queue`): search, filter row, count chips, sortable desktop table / cards
  below `lg`, pagination, open-detail action, loading/empty/no-results/forbidden/failure states.
- **IT Staff Ticket Detail** (`/staff/tickets/:ticketNumber`): grouped read-only ticket info; editable
  Ticket Owner (Claim / Reassign), IT Priority, Status (permitted targets only, confirm for
  Closed/Cancelled); tabs for Public Comments, Internal Notes (visually distinct, amber "private"
  styling), Attachments.
- **User Management** (`/admin/users`): user table (Name, Email, Role, Status, Edit), search, role
  filter, Create User button, side panel for create/edit with Set Initial Password, safety-rule
  feedback.
- Zen Green tokens, field states, button hierarchy, badge colors, responsive breakpoints, and
  accessibility rules carry over from Lab 2 `ui-spec.md` and are extended for role and status badges.

## 7. Data Changes

Prisma models (full schema in `server/prisma/schema.prisma`):

- **User** (renamed from `RequesterUser`): `id`, `name`, `email` (unique), `passwordHash`, `role`
  (`UserRole` enum: `REQUESTER | IT_STAFF | ADMIN`, default `REQUESTER`), `isActive` (default true),
  `mustChangePassword` (default true), `createdAt`, `updatedAt`.
- **Session**: `id`, `tokenHash` (unique, SHA-256 of the cookie token), `userId` (FK → User, cascade
  delete), `createdAt`, `expiresAt`; index on `userId`.
- **Ticket** adds: `ownerId` (nullable FK → User), `itPriority` (`Priority`), `requesterResolvedAt`
  (nullable). `TicketStatus` enum extended to the eight BR-25 values. Indexes on `ownerId`,
  `currentStatus`, `itPriority` (queue filters/sorts).
- **TicketComment**: `id`, `ticketId` (FK), `authorId` (FK → User), `body`, `createdAt`; index on
  `ticketId`.
- **InternalNote**: same shape as TicketComment, separate table so the authorization boundary is
  structural, not a flag.
- Unchanged: `Category`, `RelatedSystem`, `TicketSequence`, `Attachment`.

Migrations (three, one per implementation Issue, all additive/renaming — no data loss):
1. `lab3_users_sessions` — rename `RequesterUser` → `User` (table, PK, unique index, FK constraint
   names), add `passwordHash` (back-filled with the `Welcome123!` scrypt hash, then `NOT NULL`),
   `role`, `mustChangePassword`, `updatedAt`; create `UserRole` enum and `Session` table.
2. `lab3_ticket_workflow` — extend `TicketStatus`; add `ownerId`, `itPriority` (back-filled from
   `requestedPriority`), `requesterResolvedAt`, indexes.
3. `lab3_comments_notes` — create `TicketComment` and `InternalNote`.

Seed (idempotent, upsert by email / by (requester, summary)): 4 active + 1 inactive Requesters
(the Lab 2 names, now users), 1 first-login Requester (`mustChangePassword = true`), 3 active + 1
inactive IT Staff, 1 Administrator; 14 realistic Tickets spread across requesters, all eight
statuses, both priorities, assigned/unassigned; example Public Comments and Internal Notes. Seeded
passwords are documented in README (local development only).

## 8. API Contract

Full contract in `docs/lab-03/api-spec.md`. Endpoint summary:

| Method & Path | Purpose | Roles |
|---|---|---|
| POST /api/auth/login | Authenticate, issue session cookie | any |
| POST /api/auth/logout | Revoke session | any |
| GET /api/auth/me | Current user | authenticated |
| POST /api/auth/change-password | Change own password (also the first-login change) | authenticated |
| GET /api/categories, GET /api/related-systems | Lookups | authenticated |
| POST /api/tickets, GET /api/tickets, GET /api/tickets/:ticketNumber | Lab 2 Requester APIs (session identity) | Requester |
| POST /api/tickets/:ticketNumber/attachments, GET/DELETE /api/attachments/:id | Lab 2 attachment APIs | Requester (owner) |
| GET /api/attachments/:id/download | Download active attachment | Requester (owner), IT Staff, Admin |
| GET/POST /api/tickets/:ticketNumber/comments | Public Comments | Requester (owner), IT Staff, Admin |
| POST /api/tickets/:ticketNumber/requester-resolved | "Problem Appears Resolved" | Requester (owner) |
| GET /api/staff/tickets | Ticket Queue | IT Staff, Admin |
| GET /api/staff/assignees | Active IT Staff / Admin users for assignment | IT Staff, Admin |
| GET /api/staff/tickets/:ticketNumber | IT Staff Ticket Detail | IT Staff, Admin |
| POST /api/staff/tickets/:ticketNumber/claim | Claim unassigned Ticket | IT Staff, Admin |
| PATCH /api/staff/tickets/:ticketNumber/owner | Assign / reassign / unassign | IT Staff, Admin |
| PATCH /api/staff/tickets/:ticketNumber/it-priority | Set IT Priority | IT Staff, Admin |
| PATCH /api/staff/tickets/:ticketNumber/status | Permitted status transition | IT Staff, Admin |
| GET/POST /api/staff/tickets/:ticketNumber/internal-notes | Internal Notes | IT Staff, Admin |
| GET /api/admin/users | List/search/filter users | Admin |
| POST /api/admin/users | Create user | Admin |
| PATCH /api/admin/users/:id | Edit name/email/role/activation | Admin |
| POST /api/admin/users/:id/initial-password | Set new initial password | Admin |

Authentication mechanism: session cookie (BR-08). The client sends every request with
`credentials: "include"`; the server allows exactly the configured client origin with credentials
(CORS). CSRF is mitigated by `SameSite=Lax` cookies plus the CORS origin allow-list (cross-site
`fetch` from another origin cannot carry the cookie, and plain HTML form posts from another site
do not carry a Lax cookie on POST). Secrets (session tokens) live only in the httpOnly cookie and as
hashes in the DB; nothing is committed to source control.

## 9. Acceptance Criteria

- **AC-01** Given an active user with valid credentials, when the user logs in, then the backend
  establishes authenticated access and returns the permitted user identity and role.
- **AC-02** Given a user who must change the initial password, when login succeeds, then normal
  application screens remain unavailable (UI redirects, API returns 403 `PASSWORD_CHANGE_REQUIRED`)
  until a valid new password is saved.
- **AC-03** Given an authenticated Requester, when the client supplies another `requesterId` (header
  or body), then the backend still applies the authenticated identity and never returns another
  Requester's data.
- **AC-04** Given a Requester account, when an Internal Note endpoint is requested, then the
  operation is rejected (403) without exposing note content.
- **AC-05** Given an unknown email or a wrong password, when login is attempted, then the same safe
  "Invalid email or password." message is shown and no session is created.
- **AC-06** Given an inactive account with correct credentials, when login is attempted, then the
  inactive-account message is shown and no session is created.
- **AC-07** Given a logged-in user, when they log out, then `GET /api/auth/me` with the old cookie
  returns 401 and opening a protected route shows the Login screen.
- **AC-08** Given a password that violates BR-05, or a confirmation that does not match, or a current
  password that is wrong, when Change Password is submitted, then a field-level message is shown and
  the password is unchanged.
- **AC-09** Given a Requester, when they open or request any `/staff/*` or `/admin/*` screen or API,
  then the screen shows a forbidden state and the API returns 403.
- **AC-10** Given any Lab 2 Requester function (create, list, detail, add/download/remove
  attachment), when performed by an authenticated Requester, then it behaves exactly as the Lab 2
  acceptance criteria require, with ownership taken from the session.
- **AC-11** Given a Requester, when they post a Public Comment on their own Ticket, then it appears
  in the comment list with their name, role, and server timestamp; the same comment is visible to
  IT Staff on the IT Staff Ticket Detail.
- **AC-12** Given a Requester, when they mark their Ticket "Problem Appears Resolved", then the
  indication is stored and shown to IT Staff, and the Ticket's status is unchanged.
- **AC-13** Given IT Staff, when they open the Ticket Queue, then Tickets of every Requester are listed
  with Ticket Number, Created Date, Summary, Requester, Category, Requested Priority, IT Priority,
  Status, and Owner, with the all/unassigned/mine counts.
- **AC-14** Given IT Staff, when they search, filter (status, IT Priority, category, owner), sort, and
  page the queue, then the API returns the correct subset and page metadata, and invalid query
  values fall back to defaults.
- **AC-15** Given an unassigned Ticket in `NEW`, when IT Staff claim it, then the caller becomes the
  owner and the status becomes `OPEN`.
- **AC-16** Given a Ticket owned by another IT Staff, when IT Staff attempt Claim, then the API
  returns 409 and the UI offers Reassign; when they reassign to an active IT Staff / Administrator,
  then the owner changes; reassigning to an inactive or non-staff user is rejected.
- **AC-17** Given a Ticket, when IT Staff set IT Priority, then it changes while Requested Priority
  stays as submitted.
- **AC-18** Given a Ticket in a status, when IT Staff request a permitted transition, then the status
  changes; when they request a non-permitted transition, then the API returns 409 listing the
  permitted targets and nothing changes.
- **AC-19** Given a Ticket without an owner, when IT Staff attempt `RESOLVED`, then the API returns
  409 `OWNER_REQUIRED`.
- **AC-20** Given IT Staff, when they create an Internal Note, then it is listed with author and time
  for IT Staff / Administrators, and the Requester's Ticket Detail API response contains no note.
- **AC-21** Given empty or whitespace-only comment/note content, when submitted, then the API returns
  400 and nothing is stored.
- **AC-22** Given an Administrator, when they open User Management, then all users are listed with
  Name, Email, Role, Status, and an Edit action; search narrows by name or email and the role filter
  narrows by role.
- **AC-23** Given an Administrator, when they create a user with valid data and an initial password,
  then the user can log in with it and is forced to change it (AC-02).
- **AC-24** Given an email already used by another user, when an Administrator creates or edits a
  user with it, then the API returns 409 and the UI shows a field-level message.
- **AC-25** Given an Administrator, when they edit a user's name, email, role, or activation state,
  then the change is saved and reflected in the list.
- **AC-26** Given an Administrator, when they set a new initial password for a user, then that user's
  sessions end and their next login requires a password change.
- **AC-27** Given an Administrator, when they attempt to deactivate their own account, then the API
  returns 409 and the account stays active.
- **AC-28** Given the only active Administrator, when any Administrator attempts to deactivate them
  or change their role, then the API returns 409 and nothing changes.
- **AC-29** Given a non-Administrator, when they request any `/api/admin/*` endpoint, then 403 is
  returned with no user data.
- **AC-30** Given a user deactivated while logged in, when they make their next request, then it is
  rejected with 401 and the UI returns to Login.
- **AC-31** Given the Lab 2 database (RequesterUsers, Tickets, Attachments), when the Lab 3
  migrations run, then every Ticket still belongs to the same Requester (now a User with role
  `REQUESTER`), attachments are intact, `itPriority` equals `requestedPriority`, and each migrated
  user can log in with the documented initial password and is forced to change it.
- **AC-32** Given the viewport is narrower than 768px, when Login, Change Password, Ticket Queue, IT
  Staff Ticket Detail, or User Management is viewed, then no horizontal page scrolling occurs and all
  controls remain reachable and legible; tablet widths show two columns where desktop has three.
- **AC-33** Given the API is unreachable or returns 500, when any Lab 3 screen loads or submits, then
  a safe failure message with a retry path is shown and entered values are preserved.

Every AC maps to at least one planned test in `tests.md`.

## 10. Definition of Done

**Product completion:**
- All Functional Requirements and Business Rules above are implemented; the authorization matrix
  (BR-14) and transition matrix (BR-30) are enforced server-side and covered by tests.
- Every Acceptance Criterion (AC-01..AC-33) has at least one passing, traceable automated test
  (`tests.md`), and every Lab 2 Acceptance Criterion still passes through the regression suite.
- `cd server && npm test`, `cd client && npm test`, and `cd e2e && npm test` pass on the final `main`
  branch with no skipped/disabled Lab 3 tests.
- The Lab 3 migrations apply cleanly on top of a Lab 2 database without data loss (AC-31), and the
  seed is idempotent (running it twice yields the same users/tickets).
- No plaintext password, session token, or secret is stored in the DB, logged, or committed.
- The Development Requester selector, `X-Requester-Id`, and `GET /api/requesters` are gone.
- Login, Change Password, Ticket Queue, IT Staff Ticket Detail, and User Management match
  `ui-spec.md` at desktop, tablet, and mobile widths (screenshots in `artifacts/lab-03/screenshots/`)
  with the visual checklist completed.
- README documents the new env var, seeded credentials (local only), and the Lab 3 test commands.

**Course delivery:**
- Each Issue on its own feature branch, merged into `lab3-staging` via a peer-reviewed Pull Request
  with the Issue linked; one release PR from `lab3-staging` to `main`.
- `docs/lab-03/reviewer.md` and `docs/lab-03/ai-use.md` completed; Kanban shows all Lab 3 Issues Done.

## 11. Assumptions and Decisions

- **Server-side sessions over JWT.** A DB-backed session table gives real logout invalidation and
  instant revocation on deactivation/password reset (BR-09/BR-10), which a stateless JWT cannot do
  without an extra deny-list. The cost — one indexed lookup per request — is negligible here.
- **scrypt instead of bcrypt.** Node ships `crypto.scrypt`; it is a memory-hard KDF recommended for
  password storage and avoids adding a native dependency. Parameters are embedded in the hash so
  they can be raised later without a migration.
- **Inactive-account message only with correct credentials (BR-02).** This satisfies "clear response
  for inactive accounts" without letting an attacker enumerate deactivated emails.
- **Administrators may operate Tickets (BR-15).** The handout allows an Administrator to be a Ticket
  Owner, and Internal Notes are visible to Administrators; granting the IT Staff operations keeps the
  model consistent instead of a half-permitted role. The reverse (IT Staff managing users) is never
  allowed.
- **Two tables for Comments and Notes.** A single table with a `visibility` flag would make a
  forgotten `where` clause leak private notes; separate tables make the boundary structural and the
  Requester-facing query physically unable to return notes.
- **Claim vs Reassign (BR-27).** Claim is a one-click action for unassigned work; taking a Ticket
  from a colleague is an explicit Reassign so ownership changes are deliberate.
- **Status matrix (BR-30).** `NEW → OPEN` happens on first assignment; `WAITING_FOR_REQUESTER` models
  "ball is with the Requester"; `REOPENED` is reachable from both `RESOLVED` and `CLOSED`; `CANCELLED`
  is terminal; only `RESOLVED` can be `CLOSED`. Resolving requires an owner so nobody resolves
  "anonymous" work.
- **"Appears resolved" is a flag, not a status (BR-32).** Keeps the status workflow fully in IT
  Staff's hands (handout BR-05) while giving them the signal in the queue and detail.
- **Initial passwords are typed by the Administrator (BR-44).** No email delivery exists in Lab 3;
  the API never echoes a password back after saving.
- **Migrated users get `Welcome123!` (BR-46).** Documented local-lab value, hash embedded in the
  migration, forced change at first login — so no migrated account is usable without the person
  choosing their own password.
- **Queue counts (FR-13).** `all / unassigned / mine` are the only "analytics" — enough to find work,
  and well inside the "simple queue counts" allowance of §4.2 of the handout.
- **Lookups require authentication.** `GET /api/categories` and `GET /api/related-systems` now sit
  behind the session; the Lab 1 health check stays public.
- **Lab 2 tests are migrated, not deleted.** They keep their file names and ACs, authenticate via a
  shared `loginAs()` helper, and serve as the migration/regression suite. The two Lab 2 tests that
  tested the selector itself (UI-02/UI-03/UI-18/UI-17) are replaced by Login/shell tests covering the
  same behaviours for the real mechanism.
