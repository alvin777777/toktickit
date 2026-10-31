# Lab 4 Sprint Engineering Specification

Extends `docs/lab-03/specification.md`. Every Lab 3 Functional Requirement and Business Rule stays in
force unless this document amends it explicitly (BR-38). Lab 3 rules are cited as **L3 BR-nn**.

## 1. Sprint Goal

Complete the TokTickIT service-desk workflow: IT Staff plan and record the real work on a Ticket as
**Actions Taken** (several per Ticket, possibly by different staff members than the Ticket Owner),
the backend refuses to mark a Ticket **Resolved** until that work is actually recorded and finished,
every status change is kept in an append-only history, and each role lands on a concise
**Dashboard** whose numbers are computed by the backend and link to the detailed lists. All Lab 1–3
behaviour keeps working and the whole application is polished under the Zen Green design language.

## 2. Stakeholder Request Interpretation

The service desk can already receive and discuss Tickets, but nobody can see *what was done*. Each
Ticket needs a list of work entries — when it was done, what was done, the result, who did it,
whether more work is needed (and what), and a pointer to any evidence file. The Ticket Owner stays
the coordinator, but any IT Staff member may do and record a piece of the work. A Requester saying
"it looks fixed" is a hint, not a decision: only IT Staff resolve, and only once the recorded work
supports it — the server must enforce that even if someone calls the API directly. Dashboards are a
starting point (how much is open, what is waiting for me, what changed recently), not a replacement
for My Tickets or the Ticket Queue, so every number links to the list behind it. Finally the
product must feel finished: no stale UI, consistent feedback, no double submissions, and no lost
work when two people edit the same thing.

## 3. Scope

### Included
- Actions Taken under a Ticket: list, create, edit while open, start / complete / cancel, assign the
  performer to another active IT Staff / Administrator, Requester read-only view
- Final Ticket status-transition matrix with a server-enforced **resolution gate**
- Append-only Ticket **status history** (staff and owning Requester)
- Optimistic concurrency (`version`) for Ticket workflow changes and Action edits; idempotent Action
  creation (`clientRequestId`) against double clicks and network retries
- Requester Dashboard, IT Staff Dashboard, Administrator Dashboard (= IT Staff + user counts), with
  drill-down into My Tickets / Ticket Queue via URL filters
- Prisma migration with back-fill and a tested rollback script; idempotent seed extension
- Final regression of Labs 1–3, accessibility / responsive polish, README refresh

### Excluded (explicitly out of scope for Lab 4)
- SLA clocks, escalation engines, on-call scheduling, breach notifications
- Email / SMS / LINE / push or any other external notification
- Inventory, spare parts, purchasing, cost accounting, time-sheets, billing, payroll, labour cost
- Multi-level approvals, electronic signatures
- BI tools, custom report builders, exports, charts beyond simple counts
- File upload on Actions Taken (Attachment Notes is text that points to an existing Attachment)
- Editing or deleting Public Comments / Internal Notes / Actions Taken / status history
- Multi-tenant organisations, production cloud operations, any feature not listed in §3 Included

## 4. Functional Requirements

### Actions Taken
- **FR-01** IT Staff and Administrators see an **Actions Taken** list on IT Staff Ticket Detail for any
  Ticket, in stable chronological order (BR-16).
- **FR-02** IT Staff and Administrators can create an Action Taken with Action Date/Time, Action
  Description, Result, Status, Performed by (defaults to the signed-in user), Follow-Up Required?,
  Follow-up Note, and Attachment Notes.
- **FR-03** IT Staff and Administrators can edit an open (Planned / In Progress) Action Taken,
  including reassigning its performer to another active IT Staff / Administrator.
- **FR-04** IT Staff and Administrators can move an Action Taken Planned → In Progress → Completed,
  or cancel it; Completed and Cancelled actions become read-only.
- **FR-05** A Requester sees every Action Taken of their own Tickets, read-only, on Requester Ticket
  Detail; they cannot create or change one.

### Ticket workflow
- **FR-06** IT Staff and Administrators change Ticket status only along the final transition
  matrix (BR-18); the UI offers only transitions the server currently permits.
- **FR-07** The backend refuses `RESOLVED` unless the resolution gate (BR-20) is satisfied and tells
  the UI which requirement is missing.
- **FR-08** Every status change is recorded in an append-only status history shown on IT Staff and
  Requester Ticket Detail.
- **FR-09** A stale Ticket workflow change or Action edit (someone else changed it first) is
  rejected with a clear conflict message and the latest data, never silently overwritten.
- **FR-10** The Requester "Problem Appears Resolved" indication stays advisory (L3 BR-32) and is
  surfaced on the IT Staff Dashboard.

### Dashboards
- **FR-11** A Requester's Dashboard shows metric cards and short lists computed only from their own
  Tickets (BR-28).
- **FR-12** An IT Staff Dashboard shows operational metric cards, the signed-in user's open Actions
  Taken, urgent Tickets, and recently updated Tickets (BR-29).
- **FR-13** An Administrator sees the IT Staff Dashboard plus concise user-account counts (BR-30).
- **FR-14** Every dashboard card with a list behind it opens My Tickets or the Ticket Queue already
  filtered (BR-34); every list row opens the Ticket Detail.
- **FR-15** After sign-in every role lands on `/dashboard`; the shell shows a Dashboard link with
  active-page indication.

### Hardening
- **FR-16** All Lab 1–3 screens and APIs keep working for the permitted roles (regression suite).
- **FR-17** Repeated clicks or retried requests never create duplicate Actions Taken or duplicate
  status changes (BR-14, BR-26).
- **FR-18** Every Lab 4 screen shows consistent loading, validation, success, empty / no-results,
  forbidden, conflict, not-found, and safe-failure feedback; forms keep entered data after a
  recoverable failure.
- **FR-19** README setup, migration, seed, test, and demonstration instructions are current.

## 5. Business Rules

### Actions Taken
- **BR-01** An Action Taken belongs to exactly one Ticket (`ticketId NOT NULL`, FK); it is never
  moved to another Ticket.
- **BR-02** The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by a
  different IT Staff member. Owner and performer are independent fields.
- **BR-03** *Performed by* is filled automatically with the authenticated user on creation. It may
  be set (on create or edit) to another **active** `IT_STAFF` or `ADMIN` user; an inactive, unknown,
  or Requester user is rejected (400, `fields.performedById`). *Recorded by* (`createdById`) is always
  the authenticated creator and is never changed.
- **BR-04** *Action Date/Time* is required. It may not be earlier than the Ticket's creation time.
  For `IN_PROGRESS` and `COMPLETED` it may not be more than 5 minutes in the future (clock-skew
  allowance); a `PLANNED` action may be up to 90 days in the future. Stored in UTC.
- **BR-05** *Action Description* is required, trimmed, 5–1000 characters. *Result* is optional
  (≤ 2000) while the action is open and **required** (1–2000) for it to be `COMPLETED`.
- **BR-06** *Follow-Up Required?* is a boolean, default `false`. When `true`, *Follow-up Note* is
  required (trimmed, 1–1000); when `false` the note is stored as `null`.
- **BR-07** *Attachment Notes* is optional plain text (≤ 500) telling the reader which file or image
  to look at (e.g. "see screenshot vpn-error.png in Attachments"). It is not an upload.
- **BR-08** Action status values and transitions (IT Staff / Administrator only; anything else is
  409 `INVALID_ACTION_TRANSITION`):

| From | Permitted targets |
|---|---|
| (create) | PLANNED, IN_PROGRESS, COMPLETED |
| PLANNED | IN_PROGRESS, COMPLETED, CANCELLED |
| IN_PROGRESS | COMPLETED, CANCELLED |
| COMPLETED | — (final) |
| CANCELLED | — (final) |

- **BR-09** `COMPLETED` and `CANCELLED` actions are final and read-only (409 `ACTION_FINAL`);
  corrections are recorded as a new action. `completedAt` / `cancelledAt` are set by the server.
- **BR-10** Actions can be created or edited only while the Ticket is workable — `NEW`, `OPEN`,
  `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`. On `RESOLVED`, `CLOSED`, or `CANCELLED` the
  request is rejected with 409 `TICKET_NOT_WORKABLE` (reopen the Ticket first).
- **BR-11** Cancelling a Ticket cancels its open (`PLANNED` / `IN_PROGRESS`) actions in the same
  transaction, so no open work is left on a dead Ticket.
- **BR-12** Actions Taken are never deleted.
- **BR-13** Every action carries an integer `version` (starts at 1). An edit must send the
  `version` it was based on; if it no longer matches, the edit is rejected with 409
  `STALE_UPDATE` and the current action, and nothing changes. A successful edit increments it.
- **BR-14** Creation accepts an optional `clientRequestId` (UUID, generated once per form open by
  the UI). Replaying a create with the same `clientRequestId` on the same Ticket returns the
  already-created action with 200 instead of a duplicate; reusing it on another Ticket is 409
  `DUPLICATE_REQUEST`.
- **BR-15** A Requester sees every Action Taken of their own Tickets with the same fields (names
  only, no emails); another Requester's Ticket gives the identical 404 (L3 BR-17). Requesters can
  never write actions (403 on every staff action route).
- **BR-16** Actions are listed by Action Date/Time ascending, then id ascending (stable for equal
  times).

### Ticket status and resolution
- **BR-17** Ticket statuses remain `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`,
  `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`.
- **BR-18** Final transition matrix (IT Staff / Administrator only; a Requester can change no status;
  others → 409 `INVALID_TRANSITION` with the permitted list). Unchanged from L3 BR-30:

| From | Permitted targets | Extra condition |
|---|---|---|
| NEW | OPEN, CANCELLED | |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, CANCELLED | |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | RESOLVED: BR-20 |
| WAITING_FOR_REQUESTER | IN_PROGRESS, RESOLVED, CANCELLED | RESOLVED: BR-20 |
| RESOLVED | CLOSED, REOPENED | CLOSED: confirmation (L3 BR-31) |
| REOPENED | IN_PROGRESS, RESOLVED, CANCELLED | RESOLVED: BR-20 |
| CLOSED | REOPENED | |
| CANCELLED | — (terminal) | |

- **BR-19** The only automatic status change remains `NEW → OPEN` on first claim / assignment
  (L3 BR-26). Creating or completing an action never changes the Ticket status.
- **BR-20 (Resolution gate)** A Ticket may enter `RESOLVED` only when **all** hold: (a) it has a
  Ticket Owner (L3 BR-29 — still reported as 409 `OWNER_REQUIRED`); (b) at least one action is
  `COMPLETED`; (c) no action is `PLANNED` or `IN_PROGRESS`; (d) the latest `COMPLETED` action (by
  BR-16 order) does not have Follow-Up Required. Failing (b)–(d) → 409 `RESOLUTION_BLOCKED` with
  `blockers` ⊆ {`NO_COMPLETED_ACTION`, `OPEN_ACTIONS`, `FOLLOW_UP_PENDING`}. Enforced in the backend
  on every request, whatever the client shows.
- **BR-21** IT Staff Ticket Detail returns `allowedTransitions` with `RESOLVED` removed while the
  gate is not satisfied, plus `resolution: { canResolve, blockers }` so the UI can explain why.
- **BR-22** A Requester's "Problem Appears Resolved" indication is advisory: it never changes status
  (L3 BR-32) and is counted on the IT Staff Dashboard (BR-29 `appearsResolved`).
- **BR-23** `resolvedAt` is set when a Ticket enters `RESOLVED`, kept through `CLOSED`, and cleared
  when it is `REOPENED`.
- **BR-24** Every status change — Ticket creation (`→ NEW`), claim / assign (`NEW → OPEN`), manual
  transitions, and BR-11 cascades — appends one `TicketStatusHistory` row (`fromStatus`, `toStatus`,
  `changedById`, `changedAt`) in the same transaction. Rows are never updated or deleted, are listed
  `changedAt` then `id` ascending, and are visible to IT Staff / Administrators and the owning
  Requester.
- **BR-25** Every Ticket carries an integer `version`, incremented by each owner, IT Priority, or
  status change. Claim and the owner / IT Priority / status PATCHes accept `expectedVersion`; the UI
  always sends it, and a mismatch is 409 `STALE_UPDATE` with the current Ticket. Omitting it is
  allowed for Lab 3 API compatibility; the status write is still conditional on the status it was
  checked against, so two racing transitions can never both apply.
- **BR-26** A status change runs in one transaction that locks the Ticket row (`SELECT … FOR UPDATE`),
  evaluates BR-18/BR-20 against the locked state, writes the status / `resolvedAt` / `version`, and
  appends history. Action create / edit lock the same row first, so an action cannot be opened while
  the Ticket is being resolved, and a double-clicked transition applies once (the second is 409).

### Dashboards
- **BR-27** *Active* statuses = `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`.
  *Recent window* = the 7 × 24 h before the server's current time (rolling; no calendar-day
  boundary, so no time-zone ambiguity). Timestamps are returned in UTC ISO-8601 and displayed in the
  browser's local time (Asia/Bangkok for the course). Lists hold at most 5 rows.
- **BR-28** Requester Dashboard — every query is scoped `requesterId = session user`:

| Metric key | Label | Calculation | Drill-down (My Tickets) |
|---|---|---|---|
| `open` | My Open Tickets | count, status ∈ Active | `?statusGroup=active` |
| `waitingForMe` | Waiting for Me | count, status = WAITING_FOR_REQUESTER | `?currentStatus=WAITING_FOR_REQUESTER` |
| `resolved` | Resolved | count, status = RESOLVED | `?currentStatus=RESOLVED` |
| `closed` | Closed | count, status = CLOSED | `?currentStatus=CLOSED` |

  Lists: `needsAttention` (WAITING_FOR_REQUESTER or RESOLVED, `updatedAt` asc — oldest waiting
  first), `recentlyUpdated` (`updatedAt` desc), `recentlyResolved` (`resolvedAt` within the recent
  window, `resolvedAt` desc).
- **BR-29** IT Staff Dashboard (all Tickets; "me" = session user):

| Metric key | Label | Calculation | Drill-down (Ticket Queue) |
|---|---|---|---|
| `new` | New | count, status = NEW | `?status=NEW` |
| `inProgress` | In Progress | count, status = IN_PROGRESS | `?status=IN_PROGRESS` |
| `waitingForRequester` | Waiting for Requester | count, status = WAITING_FOR_REQUESTER | `?status=WAITING_FOR_REQUESTER` |
| `reopened` | Reopened | count, status = REOPENED | `?status=REOPENED` |
| `unassigned` | Unassigned | count, Active and `ownerId IS NULL` | `?statusGroup=active&owner=unassigned` |
| `mine` | My Assigned | count, Active and `ownerId = me` | `?statusGroup=active&owner=me` |
| `highPriority` | High IT Priority | count, Active and `itPriority = HIGH` | `?statusGroup=active&itPriority=HIGH` |
| `appearsResolved` | Appears Resolved | count, Active and `requesterResolvedAt IS NOT NULL` | `?statusGroup=active&appearsResolved=true` |
| `myOpenActions` | My Open Actions | count of actions `performedById = me`, status ∈ {PLANNED, IN_PROGRESS}, on a workable Ticket | the "My Open Actions" list on the dashboard |

  Breakdowns: `byStatus` (count per each of the 8 statuses, all Tickets) and `byItPriority` (count
  per priority, Active Tickets). Lists: `myOpenActions` (`actionAt` asc), `urgent` (Active, `itPriority
  = HIGH`, `createdAt` asc — oldest first), `recentlyUpdated` (`updatedAt` desc).
- **BR-30** Administrator Dashboard = BR-29 plus `userCounts` { `requesters`, `itStaff`,
  `administrators` } of **active** users and `inactive` (all roles); the card links to User
  Management.
- **BR-31** Empty behaviour: a metric with no matching records is returned as `0` and shown as "0"
  (never hidden, never an error); an empty list is `[]` and the UI shows a one-line empty message.
- **BR-32** Metrics are computed live by the backend with `COUNT` / `GROUP BY` queries on
  authoritative tables — never from client-side data and never by returning whole Ticket
  collections.
- **BR-33** Dashboards are read-only. Requesters may call only the Requester endpoint; IT Staff and
  Administrators only the staff endpoint (403 otherwise).
- **BR-34** Every metric carries the list-API query that reproduces it (`query`), so the count on the
  card equals the `totalItems` of its drill-down list.
- **BR-35** Drill-down support: `GET /api/tickets` and `GET /api/staff/tickets` accept
  `statusGroup=active`; `GET /api/staff/tickets` also accepts `appearsResolved=true`. My Tickets and
  the Ticket Queue initialise their filters from the URL query string.

### Hardening, migration, regression
- **BR-36** Legacy data: Tickets without actions remain valid and show "No actions recorded yet".
  The gate applies only when a Ticket next *enters* `RESOLVED`; legacy `RESOLVED` / `CLOSED` Tickets
  keep their status. Migration back-fills `resolvedAt = updatedAt` for legacy `RESOLVED` / `CLOSED`
  Tickets, `version = 1` for every Ticket, and one history row per Ticket (`null → currentStatus`,
  `changedAt = updatedAt`, `changedById = null`, shown as "System (migration)").
- **BR-37** Double-submit protection: every submit button is disabled while its request is in
  flight; Action creation is idempotent (BR-14); status changes are guarded by BR-25/BR-26.
- **BR-38** Amendments to Lab 3: landing page for every role becomes `/dashboard` (was My Tickets /
  Queue / Users); L3 BR-30 gains the BR-20 gate; Ticket creation now writes a history row. All other
  Lab 3 rules are unchanged and their tests remain in the regression suite.

## 6. UI Specification Summary

Full detail in `docs/lab-04/ui-spec.md`. Summary:
- **Shell**: Dashboard becomes the first navigation item for every role (Requester: Dashboard, My
  Tickets, Create Ticket; IT Staff: Dashboard, Ticket Queue; Administrator: Dashboard, Ticket Queue,
  Users); active link is bold with an underline (non-colour cue) and `aria-current="page"`.
- **Requester Dashboard** (`/dashboard`): welcome line, 4 metric cards (BR-28) each with a "View"
  link, "Needs your attention", "Recently updated", "Recently resolved" lists, Quick Actions
  (Create Ticket, My Tickets).
- **IT Staff Dashboard** (`/dashboard`): welcome line + Refresh, 8 metric cards (BR-29), "My Open
  Actions" list, "Urgent" list, "Recently updated" list, status and IT-priority breakdowns as
  labelled count rows, Quick Actions (Ticket Queue, Unassigned, Mine). Administrators also see a
  "User accounts" card.
- **Actions Taken** (IT Staff Ticket Detail, new first tab): table (md+) / stacked cards (< md) with
  status badges and a "Follow-up" badge; **create mode** (Add Action form), **view mode** (row),
  **edit mode** (inline form with Start / Complete / Cancel Action). Requester Ticket Detail shows
  the same list read-only.
- **Workflow**: status select lists only `allowedTransitions`; when Resolved is blocked a
  "To resolve this ticket" checklist names each blocker; stale conflict shows a banner with the
  latest values; a History tab lists status changes.
- Zen Green tokens, badges, buttons, feedback surfaces, breakpoints, and accessibility rules carry
  over from Lab 2/Lab 3 `ui-spec.md`.

## 7. Data Changes

Prisma models (full schema in `server/prisma/schema.prisma`):

- **ActionTaken** (new): `id`, `ticketId` (FK → Ticket, required), `actionAt` (timestamp),
  `description`, `result` (nullable), `status` (`ActionStatus` enum: `PLANNED | IN_PROGRESS |
  COMPLETED | CANCELLED`), `performedById` (FK → User), `createdById` (FK → User), `followUpRequired`
  (bool, default false), `followUpNote` (nullable), `attachmentNotes` (nullable), `clientRequestId`
  (nullable, unique), `version` (int, default 1), `createdAt`, `updatedAt`, `completedAt`,
  `cancelledAt` (nullable). Indexes: (`ticketId`, `actionAt`), (`performedById`, `status`).
- **TicketStatusHistory** (new): `id`, `ticketId` (FK), `fromStatus` (nullable `TicketStatus`),
  `toStatus`, `changedById` (nullable FK → User; null = system / migration), `changedAt`. Index
  (`ticketId`, `changedAt`).
- **Ticket** adds `version` (int, default 1, NOT NULL) and `resolvedAt` (nullable); new indexes on
  `updatedAt` and `resolvedAt` for the dashboard lists.
- Unchanged: `User`, `Session`, `Category`, `RelatedSystem`, `TicketSequence`, `Attachment`,
  `TicketComment`, `InternalNote`.

**Design decisions (justified):**
1. **Actions Taken are rows in their own table with their own status**, not a JSON column or a text
   log on Ticket. The handout asks for a parent–child structure; rows give FK integrity (BR-01),
   per-action concurrency (`version`), indexed dashboard queries (`performedById, status`), and
   let the resolution gate be a single `COUNT` with a `WHERE status IN (…)`.
2. **Integer `version` columns for optimistic concurrency**, not `updatedAt` comparison. `updatedAt`
   changes for unrelated reasons (e.g. an action touches its Ticket) and millisecond timestamps
   round-trip through JSON / `datetime-local` lossy; an integer compared in the `WHERE` of a
   conditional `UPDATE` is exact and race-free.
3. **Separate append-only `TicketStatusHistory` table** written by the same transaction as the
   status change (not a DB trigger, not a column on Ticket). Application writes keep the actor
   (`changedById`) without session variables in SQL, and the table is never updated, so history
   order is stable by `(changedAt, id)`.
4. **Two user FKs on an action (`performedById`, `createdById`).** "Performed by (auto)" and "may be
   a different IT Staff member" (BR-02/BR-03) are both true only if who *recorded* the entry and who
   *did* the work are separate facts.

**Migration** `20261031100000_lab4_actions_taken` (additive; no column dropped or renamed):
create `ActionStatus`, `ActionTaken`, `TicketStatusHistory`; add `Ticket.version` (NOT NULL with
default 1 — safe on a populated table) and `Ticket.resolvedAt`; back-fill per BR-36; add indexes.
**Rollback:** `server/prisma/rollback/20261031100000_lab4_actions_taken.down.sql` drops exactly the
Lab 4 objects (Lab 3 data untouched); MIG-05 applies up → down → up on a scratch database built from
the real migrations. Recovery for a failed deploy: restore the pre-migration `pg_dump`, or run the
down script and `prisma migrate resolve --rolled-back 20261031100000_lab4_actions_taken`.

**Seed** (idempotent; actions keyed by `(ticket, description)`): Tickets with zero, one, and several
actions; actions in all four statuses; one action performed by a different staff member than the
Ticket Owner; one completed action with Follow-Up Required (blocks resolution); history rows for
every seeded Ticket; at least one Requester metric that is 0 (Michael Brown: Waiting for Me = 0).

## 8. API Contract

Full contract in `docs/lab-04/api-spec.md`. New or changed endpoints:

| Method & Path | Purpose | Roles |
|---|---|---|
| GET /api/staff/tickets/:ticketNumber/actions | List Actions Taken | IT Staff, Admin |
| POST /api/staff/tickets/:ticketNumber/actions | Create Action Taken (idempotent with `clientRequestId`) | IT Staff, Admin |
| PATCH /api/staff/tickets/:ticketNumber/actions/:actionId | Edit / start / complete / cancel (requires `version`) | IT Staff, Admin |
| GET /api/tickets/:ticketNumber/actions | Read-only Actions Taken of own Ticket | Requester (owner) |
| GET /api/staff/tickets/:ticketNumber | + `version`, `resolvedAt`, `resolution`, `statusHistory`, gated `allowedTransitions` | IT Staff, Admin |
| GET /api/tickets/:ticketNumber | + `resolvedAt`, `statusHistory` | Requester (owner) |
| POST …/claim, PATCH …/owner, …/it-priority, …/status | + optional `expectedVersion`; status enforces BR-20 | IT Staff, Admin |
| GET /api/dashboard/requester | Requester metrics + lists | Requester |
| GET /api/dashboard/staff | IT Staff metrics + lists (+ `userCounts` for Admin) | IT Staff, Admin |
| GET /api/tickets, GET /api/staff/tickets | + `statusGroup=active`; queue + `appearsResolved=true` | as Lab 3 |

New 409 codes: `RESOLUTION_BLOCKED`, `STALE_UPDATE`, `TICKET_NOT_WORKABLE`, `ACTION_FINAL`,
`INVALID_ACTION_TRANSITION`, `DUPLICATE_REQUEST`. All Lab 2/Lab 3 endpoints, guards (CSRF origin
check → session → password-change gate → role → ownership), and error shapes are unchanged.

## 9. Acceptance Criteria

### Actions Taken
- **AC-01** Given a permitted IT Staff user and valid data, when an Action Taken is created, then it
  is saved under the correct Ticket with the authenticated user as Recorded by and Performed by
  (or the approved active performer chosen), and the server sets the timestamps.
- **AC-02** Given a Ticket, when several IT Staff members record actions on it, then all actions are
  listed under that Ticket in Action Date/Time order with each performer's name, independent of the
  Ticket Owner.
- **AC-03** Given an inactive IT Staff user, a Requester, or an unknown user as performer, when an
  action is created or edited, then the API returns 400 naming `performedById` and nothing changes.
- **AC-04** Given invalid data (short description, Follow-Up Required without a note, completion
  without a result, Action Date/Time before the Ticket or in the future for a completed action,
  over-long Attachment Notes), when submitted, then the API returns 400 with each field named and
  nothing is stored, and the UI shows the message next to the field while keeping the entered values.
- **AC-05** Given an open action, when IT Staff edit it, start it, complete it with a result, or
  cancel it, then the change is saved; given a Completed or Cancelled action, any edit is 409
  `ACTION_FINAL`.
- **AC-06** Given two users editing the same action from the same version, when both save, then the
  first succeeds and the second gets 409 `STALE_UPDATE` with the latest action, and the UI shows it
  without losing the second user's draft.
- **AC-07** Given the same create request sent twice with one `clientRequestId` (double click /
  retry), when both reach the API, then exactly one action exists.
- **AC-08** Given a Requester, when they open their own Ticket, then all its Actions Taken are shown
  read-only; when they call any staff action route, then 403; another Requester's Ticket is 404.
- **AC-09** Given a Ticket that is Resolved, Closed, or Cancelled, when an action is created or
  edited, then 409 `TICKET_NOT_WORKABLE`.

### Workflow
- **AC-10** Given each status, when IT Staff request each target, then exactly the BR-18 matrix is
  permitted (409 `INVALID_TRANSITION` otherwise) and a Requester can change no status.
- **AC-11** Given a Ticket with an owner but no completed action, open actions, or a latest completed
  action needing follow-up, when IT Staff request `RESOLVED` (including by calling the API
  directly), then 409 `RESOLUTION_BLOCKED` with the matching blockers, and nothing changes.
- **AC-12** Given a Ticket meeting the gate, when IT Staff resolve it, then status is `RESOLVED`,
  `resolvedAt` is set, a history row is appended, and the Ticket summary status refreshes in the UI.
- **AC-13** Given a Requester "appears resolved" indication, when it is recorded, then the status
  is unchanged and the IT Staff Dashboard `appearsResolved` count includes the Ticket.
- **AC-14** Given any sequence of status changes, when Ticket Detail is opened, then the history
  lists every change once, oldest first, with actor and time, and there is no API to change it.
- **AC-15** Given two staff members changing the same Ticket from the same `version`, when both
  submit, then one succeeds and the other gets 409 `STALE_UPDATE`; two identical status requests
  apply once.
- **AC-16** Given a Ticket is Cancelled, when it has open actions, then those actions become
  Cancelled in the same transaction.
- **AC-17** Given the status control, when the gate is not met, then Resolved is not offered and a
  checklist explains what is missing.

### Dashboards
- **AC-18** Given an authenticated Requester, when dashboard data is retrieved, then only metrics
  and recent Tickets owned by that Requester are returned.
- **AC-19** Given seeded and test data, when each dashboard is retrieved, then every metric equals
  the direct database count for its BR-28/BR-29 definition and the `totalItems` of its drill-down
  list query.
- **AC-20** Given no matching records, when a dashboard is retrieved, then metrics are 0 and lists
  are empty, and the UI shows "0" and empty messages, not errors.
- **AC-21** Given an IT Staff user, when the staff dashboard is retrieved, then `myOpenActions`
  contains only that user's open actions on workable Tickets; an Administrator additionally gets
  `userCounts`; IT Staff do not.
- **AC-22** Given a dashboard card, when it is activated (click or keyboard), then My Tickets or the
  Ticket Queue opens with the matching filter applied; a list row opens Ticket Detail.
- **AC-23** Given the wrong role, when a dashboard endpoint is called, then 403; unauthenticated 401.
- **AC-24** Given the API is slow, failing, or the user is forbidden, when a dashboard loads, then a
  loading state, a safe failure message with Retry, or a forbidden state is shown.

### Hardening and regression
- **AC-25** Given a Lab 3 database with Tickets, comments, notes, and attachments, when the Lab 4
  migration runs, then every row survives, legacy Tickets have no actions, `version = 1`, one
  history row each, `resolvedAt` back-filled for Resolved/Closed; the rollback script returns the
  schema to Lab 3 and the migration re-applies.
- **AC-26** Given the seed is run twice, then users, Tickets, actions, and history are not duplicated.
- **AC-27** Given every Lab 2 and Lab 3 Acceptance Criterion, when the regression suites run, then
  they pass (landing page amendment BR-38 applied).
- **AC-28** Given a viewport < 768 px, when any Lab 4 screen is viewed, then there is no horizontal
  page scroll, no clipped or overlapping control, and tablet shows two columns where desktop shows
  more.
- **AC-29** Given keyboard-only use, when the dashboards and Actions Taken are operated, then every
  control is reachable with visible focus, form fields have labels, errors are announced, and
  status is shown by text, not colour alone.
- **AC-30** Given seeded data, when the dashboard endpoints are called repeatedly, then each answers
  within 500 ms (performance smoke).

Every AC maps to at least one planned test in `tests.md`.

## 10. Definition of Done (Product Completion)

- All FRs and BRs above are implemented; the action transition matrix (BR-08), Ticket transition
  matrix (BR-18), resolution gate (BR-20), and authorization matrix (api-spec §0) are enforced in
  the backend and covered by automated tests.
- Every AC-01..AC-30 has at least one passing, traceable automated test in `tests.md`; every Lab 2
  and Lab 3 test still passes (no skipped or deleted regression test without a documented
  replacement).
- `cd server && npm test`, `cd client && npm test`, `cd e2e && npm test` pass on final `main`.
- The Lab 4 migration applies on a populated Lab 3 database without data loss and is reversible
  (MIG-05); `npx prisma migrate status` reports no drift; the seed is idempotent.
- Dashboard numbers are proven equal to direct database counts (AC-19) and to their drill-down lists.
- No console errors, broken links, placeholder text, or unfinished controls on any screen; no
  secret or real credential committed.
- Dashboards, Actions Taken, and Ticket Detail match `ui-spec.md` at desktop, tablet, and mobile
  widths (screenshots in `artifacts/lab-04/screenshots/`) with the visual/accessibility checklist
  completed.
- README documents migration, rollback, seed, accounts, test, and demo steps for Lab 4.
- Course delivery: each Issue on a feature branch, peer-reviewed PR into `lab4-staging`, one
  release PR `lab4-staging → main`; `reviewer.md`, `ai-use.md` complete; Kanban shows every Lab 4
  Issue Done.

## 11. Assumptions and Decisions

- **Action status is added** although the handout lists only the content fields: "plan and track
  the actual work" (stakeholder) and the grading rubric ("assign, status transition, complete,
  cancel") need planned vs finished work, and the resolution gate needs to know which work is done.
- **Performer reassignment = "assign"** for actions; there is no separate assignee field (BR-03).
- **Completed actions are final** (BR-09) — the record of what was done should not be rewritten;
  a correction is a new, visible action. This also keeps the gate's inputs stable.
- **Follow-up blocks resolution only if it is on the latest completed action** (BR-20d): an old
  follow-up that a later action dealt with should not keep the Ticket open forever, and no separate
  "follow-up done" flag is needed.
- **Actions don't move the Ticket status** (BR-19) — status stays a deliberate IT Staff decision,
  consistent with L3 BR-32 and the handout's "IT Staff must formally update the Ticket".
- **Requesters see every action field** (handout §8.3 "Requesters will see all Actions Taken
  items"); sensitive operational content belongs in Internal Notes, which remain staff-only.
- **`expectedVersion` optional on Lab 3 PATCHes** to keep Lab 3 clients and tests valid; the Lab 4 UI
  always sends it, and the conditional status write prevents double application regardless.
- **Dashboard landing for all roles** (BR-38): the handout's mock-ups put Dashboard first; the Lab 3
  landing pages remain one click away.
- **Rolling 7-day window instead of "this week"** avoids week-start and time-zone boundary rules
  entirely (BR-27).
- **No caching of dashboard numbers**: data volume is small and live numbers are what make the
  "matches the database" evidence trivially true.
