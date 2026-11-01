# Lab 4 API Contract

Extends `docs/lab-03/api-spec.md`. Everything there — session cookie, CSRF origin check, error
shape, guards, and every Lab 2/Lab 3 endpoint — is unchanged unless amended below. Business-rule
references (BR-nn) are to `docs/lab-04/specification.md`.

## 0. Conventions

### Guards (same order as Lab 3)
0. CSRF origin check on unsafe methods → 403 `CSRF_REJECTED`
1. `requireAuth` → 401 `UNAUTHENTICATED`
2. password-change gate → 403 `PASSWORD_CHANGE_REQUIRED`
3. `requireRole(...)` → 403 `FORBIDDEN` (before any lookup)
4. ownership — Requester-scoped queries include `requesterId = session.userId` (404 if not owned)

### Authorization matrix (Lab 4 additions)
| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| List Actions Taken of a Ticket | ✓ own Tickets (read-only) | ✓ any | ✓ any |
| Create / edit / start / complete / cancel Action Taken | ✗ (403) | ✓ | ✓ |
| Status history (inside Ticket Detail) | ✓ own Tickets | ✓ any | ✓ any |
| Requester Dashboard | ✓ (own data only) | ✗ (403) | ✗ (403) |
| IT Staff Dashboard | ✗ (403) | ✓ | ✓ (+ `userCounts`) |

### New conflict codes (409)
| Code | When |
|---|---|
| `RESOLUTION_BLOCKED` | `RESOLVED` requested but BR-20 (b)–(d) fail; body has `blockers` |
| `STALE_UPDATE` | `version` / `expectedVersion` no longer matches; body has `current` |
| `TICKET_NOT_WORKABLE` | Action write on a `RESOLVED` / `CLOSED` / `CANCELLED` Ticket (BR-10) |
| `ACTION_FINAL` | Edit of a `COMPLETED` / `CANCELLED` action (BR-09) |
| `INVALID_ACTION_TRANSITION` | Action status move outside BR-08; body has `allowed` |
| `DUPLICATE_REQUEST` | `clientRequestId` already used on another Ticket (BR-14) |

Existing codes keep their meaning (`OWNER_REQUIRED`, `INVALID_TRANSITION`, `TICKET_TERMINAL`, …).

### Action Taken object
```json
{
  "id": 12,
  "ticketId": 4,
  "actionAt": "2026-10-30T03:15:00.000Z",
  "description": "Replaced the docking station firmware (v2.1 → v2.4).",
  "result": "Dock now detected after sleep on 5/5 attempts.",
  "status": "COMPLETED",
  "performedBy": { "id": 8, "name": "Kevin Patel", "role": "IT_STAFF" },
  "createdBy": { "id": 7, "name": "Emily Davis", "role": "IT_STAFF" },
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": "See dock-firmware.png in Attachments",
  "version": 3,
  "createdAt": "2026-10-30T03:20:11.000Z",
  "updatedAt": "2026-10-30T04:02:45.000Z",
  "completedAt": "2026-10-30T04:02:45.000Z",
  "cancelledAt": null
}
```
`status` ∈ `PLANNED | IN_PROGRESS | COMPLETED | CANCELLED`. User references carry id, name, role
only (no email). The same shape is returned to Requesters (BR-15).

### Status history entry
```json
{ "id": 31, "fromStatus": "IN_PROGRESS", "toStatus": "RESOLVED",
  "changedBy": { "id": 7, "name": "Emily Davis", "role": "IT_STAFF" },
  "changedAt": "2026-10-30T04:05:00.000Z" }
```
`fromStatus` is `null` for the creation / migration row; `changedBy` is `null` for rows written by
the migration back-fill (UI label "System (migration)").

### Validation (400 `fields`)
| Field | Rule (BR) | Message |
|---|---|---|
| `description` | 5–1000 after trim (BR-05) | "Description must be 5-1000 characters." |
| `result` | ≤ 2000; 1–2000 when the resulting status is COMPLETED (BR-05) | "Result is required to complete an action." / "Result must be at most 2000 characters." |
| `actionAt` | valid ISO date-time, ≥ Ticket createdAt, ≤ now + 5 min (IN_PROGRESS / COMPLETED) or ≤ now + 90 days (PLANNED) (BR-04) | "Enter a valid date and time." / "Action date cannot be before the ticket was created." / "Action date cannot be in the future." |
| `status` | create: PLANNED / IN_PROGRESS / COMPLETED (BR-08) | "Select a valid status." |
| `performedById` | active IT_STAFF / ADMIN (BR-03) | "Select an active IT Staff or Administrator." |
| `followUpNote` | 1–1000 when `followUpRequired` is true (BR-06) | "Follow-up note is required when follow-up is needed." |
| `attachmentNotes` | ≤ 500 (BR-07) | "Attachment notes must be at most 500 characters." |
| `followUpRequired` | boolean | "Must be true or false." |
| `version` | positive integer (PATCH only, BR-13) | "Version is required." |

All field errors are returned together in one 400; nothing is written.

---

## 1. Actions Taken

### 1.1 GET /api/staff/tickets/:ticketNumber/actions
Roles: IT Staff, Administrator.
- **200** → `ActionTaken[]` ordered `actionAt` asc, `id` asc (BR-16); `[]` for a Ticket without actions
- **404** `{ "error": "Ticket not found" }`
- **403** Requester (before lookup)

### 1.2 POST /api/staff/tickets/:ticketNumber/actions
Roles: IT Staff, Administrator. Body (JSON):
```json
{ "actionAt": "2026-10-30T03:15:00.000Z", "description": "…", "result": "…",
  "status": "COMPLETED", "performedById": 8, "followUpRequired": false,
  "followUpNote": null, "attachmentNotes": "…", "clientRequestId": "7f0c…-uuid" }
```
`status` defaults to `COMPLETED` when omitted; `performedById` defaults to the caller (BR-03);
`createdById` is always the caller and is not accepted from the client.
- **201** → `ActionTaken`
- **200** → the existing `ActionTaken` when `clientRequestId` was already used on this Ticket (BR-14)
- **400** validation (table above)
- **404** Ticket not found
- **409** `TICKET_NOT_WORKABLE` (BR-10) · `DUPLICATE_REQUEST` (BR-14)

The create runs in a transaction that first locks the Ticket row (BR-26) and touches the Ticket's
`updatedAt` (so "recently updated" lists reflect new work).

### 1.3 PATCH /api/staff/tickets/:ticketNumber/actions/:actionId
Roles: IT Staff, Administrator. Body — `version` required, every other field optional:
```json
{ "version": 2, "status": "COMPLETED", "result": "Dock detected after sleep.",
  "description": "…", "actionAt": "…", "performedById": 9,
  "followUpRequired": true, "followUpNote": "Check again on Monday", "attachmentNotes": "…" }
```
Validation applies to the merged result (stored values + supplied changes), so completing an action
whose stored `result` is empty without sending one is a 400 on `result`.
- **200** → updated `ActionTaken` (`version` + 1; `completedAt` / `cancelledAt` set on those moves)
- **400** validation
- **404** Ticket not found, or the action does not belong to that Ticket
- **409** `STALE_UPDATE` `{ "error": "This action was changed by someone else.", "code": "STALE_UPDATE", "current": <ActionTaken> }`
  · `ACTION_FINAL` · `INVALID_ACTION_TRANSITION` `{ "allowed": ["COMPLETED","CANCELLED"] }` ·
  `TICKET_NOT_WORKABLE`

### 1.4 GET /api/tickets/:ticketNumber/actions
Roles: Requester (owner). Same response as §1.1; not owned / missing → identical 404 (BR-15).
IT Staff / Administrator → 403 (they use §1.1).

---

## 2. Ticket workflow (amended Lab 3 endpoints)

### 2.1 GET /api/staff/tickets/:ticketNumber — added fields
```json
{
  "...": "all Lab 3 fields",
  "version": 4,
  "resolvedAt": null,
  "allowedTransitions": ["WAITING_FOR_REQUESTER", "CANCELLED"],
  "resolution": { "canResolve": false, "blockers": ["OPEN_ACTIONS"] },
  "actionCounts": { "total": 3, "open": 1, "completed": 2, "cancelled": 0 },
  "statusHistory": [ <StatusHistoryEntry>, … ]
}
```
`allowedTransitions` excludes `RESOLVED` whenever `resolution.canResolve` is false (BR-21).
`resolution.blockers` may include `OWNER_REQUIRED`, `NO_COMPLETED_ACTION`, `OPEN_ACTIONS`,
`FOLLOW_UP_PENDING`.

### 2.2 GET /api/tickets/:ticketNumber (Requester) — added fields
`resolvedAt`, `statusHistory` (same entry shape). No `version`, `resolution`, or Internal Note data.

### 2.3 PATCH /api/staff/tickets/:ticketNumber/status
Body: `{ "status": "RESOLVED", "expectedVersion": 4 }` (`expectedVersion` optional — BR-25).
Order of checks inside one locked transaction (BR-26):
1. `expectedVersion` given and ≠ current → **409** `STALE_UPDATE` with `current` (staff Ticket)
2. not in BR-18 matrix → **409** `INVALID_TRANSITION` with `allowed`
3. target `RESOLVED` without owner → **409** `OWNER_REQUIRED`
4. target `RESOLVED` failing BR-20 (b)–(d) →
   **409** `{ "error": "This ticket cannot be resolved yet.", "code": "RESOLUTION_BLOCKED", "blockers": ["OPEN_ACTIONS"] }`
5. write status, `version + 1`, `resolvedAt` (set on RESOLVED, cleared on REOPENED — BR-23); target
   `CANCELLED` also cancels open actions (BR-11); append history (BR-24)
- **200** → staff Ticket (§2.1)

### 2.4 POST …/claim, PATCH …/owner, PATCH …/it-priority
Accept optional `expectedVersion` (body) → 409 `STALE_UPDATE` on mismatch. Each successful change
increments `version`; a claim / assignment that moves `NEW → OPEN` appends a history row.
Responses unchanged otherwise.

### 2.5 List filters (drill-down — BR-35)
- `GET /api/tickets?statusGroup=active` — My Tickets limited to Active statuses (BR-27). Ignored if
  `currentStatus` is also given (the specific status wins). Any other value is ignored.
- `GET /api/staff/tickets?statusGroup=active&appearsResolved=true` — Queue limited to Active
  statuses / to Tickets with `requesterResolvedAt` set. Combine with the existing `status`,
  `itPriority`, `owner`, `categoryId`, `search` filters.

---

## 3. Dashboards

Both endpoints are read-only `GET`s, computed live (BR-32), and return counts and at most 5 rows per
list — never whole Ticket collections.

### Common shapes
```json
{ "value": 3, "query": { "statusGroup": "active" } }                 // Metric
{ "ticketNumber": "TKT-2026-000123", "summary": "…", "currentStatus": "IN_PROGRESS",
  "itPriority": "HIGH", "updatedAt": "…", "resolvedAt": null }        // TicketSummary
```
`query` is exactly the list-API query that reproduces the count (BR-34); the client turns it into
the drill-down URL (`/tickets?…` for Requesters, `/staff/queue?…` for staff). A metric with no
list behind it has `"query": null`.

### 3.1 GET /api/dashboard/requester
Roles: Requester.
```json
{
  "generatedAt": "2026-10-31T05:00:00.000Z",
  "recentWindowDays": 7,
  "metrics": {
    "open":         { "value": 3, "query": { "statusGroup": "active" } },
    "waitingForMe": { "value": 1, "query": { "currentStatus": "WAITING_FOR_REQUESTER" } },
    "resolved":     { "value": 1, "query": { "currentStatus": "RESOLVED" } },
    "closed":       { "value": 1, "query": { "currentStatus": "CLOSED" } }
  },
  "needsAttention":   [ <TicketSummary> ],
  "recentlyUpdated":  [ <TicketSummary> ],
  "recentlyResolved": [ <TicketSummary> ]
}
```
Every query is scoped to `requesterId = session user` (AC-18). Calculations: BR-28.
- **200** · **401** · **403** (IT Staff / Administrator) · **500** `{ "error": "Unable to load dashboard" }`

### 3.2 GET /api/dashboard/staff
Roles: IT Staff, Administrator.
```json
{
  "generatedAt": "…",
  "recentWindowDays": 7,
  "metrics": {
    "new":                 { "value": 2, "query": { "status": "NEW" } },
    "inProgress":          { "value": 4, "query": { "status": "IN_PROGRESS" } },
    "waitingForRequester": { "value": 1, "query": { "status": "WAITING_FOR_REQUESTER" } },
    "reopened":            { "value": 1, "query": { "status": "REOPENED" } },
    "unassigned":          { "value": 3, "query": { "statusGroup": "active", "owner": "unassigned" } },
    "mine":                { "value": 3, "query": { "statusGroup": "active", "owner": "me" } },
    "highPriority":        { "value": 3, "query": { "statusGroup": "active", "itPriority": "HIGH" } },
    "appearsResolved":     { "value": 0, "query": { "statusGroup": "active", "appearsResolved": "true" } },
    "myOpenActions":       { "value": 2, "query": null }
  },
  "byStatus":     { "NEW": 2, "OPEN": 3, "IN_PROGRESS": 4, "WAITING_FOR_REQUESTER": 1, "RESOLVED": 2, "CLOSED": 1, "REOPENED": 1, "CANCELLED": 1 },
  "byItPriority": { "LOW": 4, "MEDIUM": 3, "HIGH": 3 },
  "myOpenActions": [ { "id": 5, "ticketNumber": "TKT-…", "ticketSummary": "…", "description": "…", "status": "PLANNED", "actionAt": "…" } ],
  "urgent":          [ <TicketSummary + owner { id, name } | null> ],
  "recentlyUpdated": [ <TicketSummary + owner> ],
  "userCounts": { "requesters": 5, "itStaff": 3, "administrators": 1, "inactive": 2 }
}
```
`userCounts` is present only for Administrators (BR-30, AC-21). Calculations: BR-29.
- **200** · **401** · **403** (Requester) · **500** `{ "error": "Unable to load dashboard" }`

---

## 4. Session probe (hardening)

### 4.1 GET /api/auth/session
Public (no guard). The client's boot-time check of "who am I", replacing its use of
`GET /api/auth/me`. Same session lookup as `requireAuth`, but an absent or dead session is a normal
answer rather than an error, so opening the sign-in page leaves no failed request in the browser
console (FR-18).
- **200** `{ "user": <User> }` — valid session (including a user who must change their password)
- **200** `{ "user": null }` — no cookie, unknown / expired session, or inactive user (a dead cookie is cleared)
- **500** `{ "error": "Unable to verify session" }`

`GET /api/auth/me` keeps its Lab 3 contract (401 when unauthenticated, L3 AC-07).

## 5. Unchanged endpoints (regression)

All endpoints listed in `docs/lab-03/specification.md` §8 keep their paths, roles, request and
response shapes; the only additions are the optional fields above. `GET /api/health` remains
`{ "status": "ok", "service": "TokTickIT API" }`.
