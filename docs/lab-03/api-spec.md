# Lab 3 API Contract

## 0. Conventions

### Authentication
- Session cookie `toktickit_session` (httpOnly, `SameSite=Lax`, `Path=/`, `Secure` when
  `NODE_ENV=production`, max-age 8 h) issued by `POST /api/auth/login` (specification.md BR-08).
- The client calls every endpoint with `credentials: "include"`. CORS allows only `CLIENT_ORIGIN`
  (default `http://localhost:5173`) with credentials.
- The Lab 2 `X-Requester-Id` header is **removed**; if sent it is ignored (BR-13).

### Error shape
```json
{ "error": "Human-readable safe message", "code": "MACHINE_CODE", "fields": { "email": "…" } }
```
`code` and `fields` are optional. Messages never include stack traces, SQL, or whether another
user's resource exists.

### Status codes used
| Status | Meaning |
|---|---|
| 200 / 201 / 204 | Success (201 for created rows, 204 for logout) |
| 400 | Validation failure — `fields` names each invalid field |
| 401 | No valid session (`UNAUTHENTICATED`) — cookie cleared |
| 403 | Authenticated but not permitted (`FORBIDDEN`), `PASSWORD_CHANGE_REQUIRED`, `ACCOUNT_INACTIVE` at login, or `CSRF_REJECTED` (unsafe method without an allowed `Origin`/`Referer`) |
| 404 | Not found, or Requester-scoped resource not owned (never distinguished — BR-17) |
| 409 | Conflict — `EMAIL_TAKEN`, `ALREADY_ASSIGNED`, `INVALID_TRANSITION`, `OWNER_REQUIRED`, `TICKET_TERMINAL`, `TICKET_NOT_COMMENTABLE`, `ALREADY_INDICATED`, `SELF_DEACTIVATION`, `LAST_ADMIN` |
| 500 | Unexpected failure, safe generic message |

### Common guards (applied in this order on every protected route)
0. **CSRF origin check** (all unsafe methods, every route — BR-09a) — `Origin`, or `Referer` when
   `Origin` is absent, must match `CLIENT_ORIGIN` → else 403
   `{ "error": "Request origin not allowed", "code": "CSRF_REJECTED" }`.
1. **requireAuth** — valid, unexpired session whose user is active → else 401 and cookie cleared.
2. **password-change gate** — `mustChangePassword` users may only call §1.2, §1.3, §1.4 → else 403
   `PASSWORD_CHANGE_REQUIRED`.
3. **requireRole(...)** — role not in the allow-list → 403 `FORBIDDEN` (before any DB lookup).
4. **ownership** — Requester-scoped queries always include `requesterId = session.userId`.

### User object (returned by auth endpoints)
```json
{ "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@toktickit.dev",
  "role": "REQUESTER", "mustChangePassword": false }
```
`role` ∈ `REQUESTER | IT_STAFF | ADMIN`.

---

## 1. Authentication

### 1.1 POST /api/auth/login
Body: `{ "email": "…", "password": "…" }` (JSON). Email is trimmed and lower-cased (BR-03).

- **200 OK** → `{ "user": <User> }` + `Set-Cookie: toktickit_session=…`
- **400** `{ "error": "Invalid login data", "fields": { "email": "Email is required.", "password": "Password is required." } }`
- **401** `{ "error": "Invalid email or password.", "code": "INVALID_CREDENTIALS" }` — unknown email,
  wrong password, or inactive + wrong password (BR-01/BR-02)
- **403** `{ "error": "This account is inactive. Contact an administrator.", "code": "ACCOUNT_INACTIVE" }`
  — inactive user with correct credentials (BR-02); no session created
- **500** `{ "error": "Unable to sign in right now" }`

### 1.2 POST /api/auth/logout
No body. Deletes the session row (if any) and clears the cookie.
- **204 No Content** — always (BR-09)

### 1.3 GET /api/auth/me
- **200 OK** → `{ "user": <User> }`
- **401** `{ "error": "Authentication required", "code": "UNAUTHENTICATED" }`

Allowed while `mustChangePassword` is true (the client uses it to decide where to route).

### 1.4 POST /api/auth/change-password
Body: `{ "currentPassword": "…", "newPassword": "…", "confirmPassword": "…" }`
- **200 OK** → `{ "user": <User> }` (`mustChangePassword` now `false`); all *other* sessions of the
  user are deleted in the same transaction as the password update (BR-07, AC-36)
- **400** `fields` may contain `currentPassword` ("Current password is incorrect." / "…required."),
  `newPassword` (BR-05 rule text, or "New password must differ from the current password."),
  `confirmPassword` ("Passwords do not match.")
- **401** as above

---

## 2. Lookups (any authenticated role)

### 2.1 GET /api/categories → `[{ "id": 1, "name": "Hardware" }, …]`
### 2.2 GET /api/related-systems → `[{ "id": 1, "name": "Email" }, …]` (active only)
Both: **401** if unauthenticated. (`GET /api/requesters` from Lab 2 is removed → 404.)

---

## 3. Requester endpoints (role `REQUESTER`)

All Lab 2 request/response shapes are preserved (see `docs/lab-02/api-spec.md` §4–§10); only the
identity source changes. Differences listed here.

### 3.1 POST /api/tickets — unchanged body; `requesterId` is taken from the session. Response adds
`"itPriority"` (equal to `requestedPriority`), `"ownerId": null`, `"requesterResolvedAt": null`.
Any `requesterId` field in the body is ignored (AC-03).
### 3.2 GET /api/tickets — unchanged; `currentStatus` accepts all BR-25 values; items add `itPriority`.
### 3.3 GET /api/tickets/:ticketNumber — response adds:
```json
"itPriority": "MEDIUM", "owner": { "id": 7, "name": "Emily Davis" } | null,
"requesterResolvedAt": "2026-10-03T08:00:00.000Z" | null
```
### 3.4 POST /api/tickets/:ticketNumber/attachments, GET /api/attachments/:id,
DELETE /api/attachments/:id — unchanged, Requester (owner) only.
### 3.5 GET /api/attachments/:id/download — Requester (owner) **or** IT Staff / Administrator
(any Ticket). Removed attachments still 404 for everyone (Lab 2 BR-18).

### 3.6 GET /api/tickets/:ticketNumber/comments
Roles: Requester (own Ticket, else 404), IT Staff, Administrator.
- **200 OK**
```json
[{ "id": 3, "ticketId": 42, "body": "Thanks, I will try that.",
   "author": { "id": 1, "name": "Jennifer Anderson", "role": "REQUESTER" },
   "createdAt": "2026-10-03T08:00:00.000Z" }]
```
ordered `createdAt` asc (BR-39).

### 3.7 POST /api/tickets/:ticketNumber/comments
Body: `{ "body": "…" }` — trimmed, 1–2000 chars (BR-37). Roles as §3.6.
- **201 Created** → the comment object
- **400** `{ "error": "Invalid comment", "fields": { "body": "Comment must be 1-2000 characters." } }`
- **404** Ticket not found / not owned (Requester)
- **409** `{ "error": "Comments are closed for this ticket", "code": "TICKET_NOT_COMMENTABLE" }` (BR-38)

### 3.8 POST /api/tickets/:ticketNumber/requester-resolved
No body. Requester, own Ticket only.
- **200 OK** → Ticket detail (§3.3 shape) with `requesterResolvedAt` set; status unchanged (BR-32)
- **404** not found / not owned
- **409** `{ "code": "ALREADY_INDICATED" }` or `{ "code": "TICKET_TERMINAL" }` (status already
  RESOLVED/CLOSED/CANCELLED). Exactly-once is enforced by a conditional update on
  `requesterResolvedAt IS NULL` (AC-35).

---

## 4. IT Staff endpoints (roles `IT_STAFF`, `ADMIN`)

A Requester (or unauthenticated caller) gets 403 / 401 from every `/api/staff/*` route before any
Ticket lookup (BR-18).

### 4.1 GET /api/staff/tickets — Ticket Queue
Query (BR-34; invalid values fall back to defaults):
`search`, `status` (BR-25 value), `itPriority` (`LOW|MEDIUM|HIGH`), `categoryId`,
`owner` (`unassigned` | `me` | numeric user id), `sortBy`
(`createdAt|updatedAt|itPriority|currentStatus|ticketNumber`, default `createdAt`),
`sortDir` (`asc|desc`, default `desc`), `page` (default 1), `pageSize` (default 10, max 50).

- **200 OK**
```json
{
  "items": [{
    "id": 42, "ticketNumber": "TKT-2026-000042", "summary": "Laptop battery drains quickly",
    "category": { "id": 2, "name": "Hardware" },
    "requester": { "id": 1, "name": "Jennifer Anderson" },
    "requestedPriority": "MEDIUM", "itPriority": "HIGH", "currentStatus": "IN_PROGRESS",
    "owner": { "id": 7, "name": "Emily Davis" } | null,
    "requesterResolvedAt": null,
    "createdAt": "…", "updatedAt": "…"
  }],
  "page": 1, "pageSize": 10, "totalItems": 87, "totalPages": 9,
  "counts": { "all": 87, "unassigned": 12, "mine": 9 }
}
```
`counts` are computed over *all* Tickets (not the filtered set) so the chips are stable navigation.
Priority sorting uses the enum order LOW < MEDIUM < HIGH; status sorting uses the enum declaration
order of BR-25.

### 4.2 GET /api/staff/assignees
- **200 OK** → `[{ "id": 7, "name": "Emily Davis", "role": "IT_STAFF" }, …]` — active IT Staff and
  Administrators, name asc (BR-23).

### 4.3 GET /api/staff/tickets/:ticketNumber — IT Staff Ticket Detail
- **200 OK**
```json
{
  "id": 42, "ticketNumber": "TKT-2026-000042", "ticketDate": "…",
  "requester": { "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@toktickit.dev" },
  "category": { "id": 2, "name": "Hardware" }, "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
  "summary": "…", "description": "…",
  "requestedPriority": "MEDIUM", "itPriority": "HIGH", "currentStatus": "IN_PROGRESS",
  "owner": { "id": 7, "name": "Emily Davis", "role": "IT_STAFF" } | null,
  "requesterResolvedAt": null,
  "allowedTransitions": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  "attachments": [ <Lab 2 attachment objects, active and removed> ],
  "createdAt": "…", "updatedAt": "…"
}
```
- **404** `{ "error": "Ticket not found" }` (only when it truly does not exist — IT Staff see every Ticket)

### 4.4 POST /api/staff/tickets/:ticketNumber/claim
No body. Sets `owner = caller`; `NEW → OPEN` (BR-26).
- **200 OK** → detail (§4.3 shape)
- **409** `{ "code": "ALREADY_ASSIGNED", "error": "This ticket is already owned by Emily Davis." }` (BR-27) — decided by a conditional update on `ownerId IS NULL`, so two simultaneous claims yield exactly one 200 (AC-35)
- **409** `{ "code": "TICKET_TERMINAL" }` (BR-28) · **404**

### 4.5 PATCH /api/staff/tickets/:ticketNumber/owner
Body: `{ "ownerId": 7 }` or `{ "ownerId": null }` (unassign).
- **200 OK** → detail. `NEW → OPEN` when assigning (BR-26).
- **400** `{ "fields": { "ownerId": "Select an active IT Staff or Administrator." } }` (BR-23)
- **409** `TICKET_TERMINAL` · **409** `OWNER_REQUIRED` when unassigning a `RESOLVED` Ticket (BR-29 invariant: a resolved Ticket always keeps an owner) · **404**

### 4.6 PATCH /api/staff/tickets/:ticketNumber/it-priority
Body: `{ "itPriority": "LOW" | "MEDIUM" | "HIGH" }`
- **200 OK** → detail · **400** `fields.itPriority` · **409** `TICKET_TERMINAL` · **404**

### 4.7 PATCH /api/staff/tickets/:ticketNumber/status
Body: `{ "status": "<BR-25 value>" }`
- **200 OK** → detail
- **400** `fields.status` ("Unknown status.")
- **409** `{ "code": "INVALID_TRANSITION", "error": "Cannot move from IN_PROGRESS to CLOSED.", "allowed": ["WAITING_FOR_REQUESTER","RESOLVED","CANCELLED"] }` (BR-30)
- **409** `{ "code": "OWNER_REQUIRED", "error": "Assign a ticket owner before resolving." }` (BR-29)
- **404**

### 4.8 GET /api/staff/tickets/:ticketNumber/internal-notes
- **200 OK** → `[{ "id", "ticketId", "body", "author": { "id", "name", "role" }, "createdAt" }]` asc
- **403** `FORBIDDEN` for Requesters — evaluated before the Ticket lookup (AC-04) · **404**

### 4.9 POST /api/staff/tickets/:ticketNumber/internal-notes
Body: `{ "body": "…" }` (BR-37). Always allowed regardless of status (BR-38).
- **201 Created** → note object · **400** `fields.body` · **403** · **404**

---

## 5. Administrator endpoints (role `ADMIN`)

Non-Administrators get 403 `FORBIDDEN` with no data (AC-29).

### Admin user object
```json
{ "id": 9, "name": "Emily Davis", "email": "emily.davis@toktickit.dev", "role": "IT_STAFF",
  "isActive": true, "mustChangePassword": false, "createdAt": "…", "updatedAt": "…" }
```
`passwordHash` is never serialized.

### 5.1 GET /api/admin/users
Query: `search` (name or email, case-insensitive substring), `role` (one BR-12 value; invalid → ignored).
- **200 OK** → `[ <Admin user object>, … ]` ordered by name asc. No pagination (handout §8.5).

### 5.2 POST /api/admin/users
Body: `{ "name", "email", "role", "isActive": true, "initialPassword" }`
- **201 Created** → user (with `mustChangePassword: true`, BR-20)
- **400** `fields` ∈ `name` (BR-19), `email` (BR-19), `role` ("Select a valid role."), `isActive`
  ("Must be true or false."), `initialPassword` (BR-05 text)
- **409** `{ "code": "EMAIL_TAKEN", "error": "A user with this email already exists.", "fields": { "email": "…" } }`

### 5.3 PATCH /api/admin/users/:id
Body: any subset of `{ "name", "email", "role", "isActive" }`.
- **200 OK** → user. If `isActive` becomes false, the user's sessions are deleted in the same
  transaction (BR-10, AC-36). The `LAST_ADMIN` decision locks the active Administrator rows
  (`SELECT … FOR UPDATE`) inside that transaction, so concurrent demotions cannot leave zero
  active Administrators (AC-35).
- **400** `fields` as above (also when the body contains none of the four fields)
- **404** `{ "error": "User not found" }`
- **409** `EMAIL_TAKEN` · **409** `{ "code": "SELF_DEACTIVATION", "error": "You cannot deactivate your own account." }`
  (BR-42) · **409** `{ "code": "LAST_ADMIN", "error": "At least one active Administrator is required." }`
  (BR-43 — deactivating or changing the role of the last active Administrator)

### 5.4 POST /api/admin/users/:id/initial-password
Body: `{ "initialPassword": "…" }` (BR-05).
- **200 OK** → user (`mustChangePassword: true`); the user's sessions are deleted in the same
  transaction as the password update (BR-44, AC-36)
- **400** `fields.initialPassword` · **404**

---

## 6. Session lifecycle summary

| Event | Effect |
|---|---|
| Login | New Session row (`expiresAt = now + 8h`), cookie set |
| Any request | Session looked up by token hash; expired/missing → 401 + cookie cleared; user inactive → 401 |
| Logout | Session row deleted, cookie cleared |
| Change own password | All other sessions of the user deleted |
| Admin deactivates user / sets initial password | All sessions of that user deleted |
