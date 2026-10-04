# Lab 3 Test Plan and Results

## 1. Test Strategy

Tests are planned here from `specification.md` before implementation (Test DD), then written
failing and implemented against until green (TDD), per Issue. Every Lab 3 Acceptance Criterion
(AC-01..AC-33) maps to at least one row in §2, and every Lab 2 Acceptance Criterion stays covered by
the migrated regression suite in §3. The **Final** column starts as `Planned` and becomes `Pass`
when the test passes on `main`.

Test types: Unit (pure functions), API (Supertest against the real Express app + Postgres), UI
(Vitest + Testing Library, API mocked), SEC (direct API authorization evidence), MIG
(migration/regression), RESP (responsive/visual, Playwright), E2E (Playwright against both dev
servers).

Server API tests authenticate through a shared helper `server/tests/helpers/auth.ts` (`loginAs(email)`
returns the session cookie; `asRequester()`, `asStaff()`, `asAdmin()` wrap seeded accounts), so no
test ever sends `X-Requester-Id`.

## 2. Planned Tests (Lab 3)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-04 | scrypt hash + verify round trip; different salts per hash; wrong password fails | verify true/false correctly; two hashes of same password differ | server/tests/lab-03/password.unit.test.ts | Pass |
| UNIT-02 | Unit | BR-05 | Password rule validator boundaries (7/8/72/73 chars, missing upper/lower/digit) | Exactly the BR-05 set accepted | server/tests/lab-03/password.unit.test.ts | Pass |
| UNIT-03 | Unit | BR-30 | Status transition matrix: every (from, to) pair | Permitted pairs true, all others false; CANCELLED has no targets | server/tests/lab-03/status-transitions.unit.test.ts | Pass |
| API-01 | API | AC-01, BR-01 | POST /api/auth/login with valid active credentials | 200, user id/name/email/role, Set-Cookie httpOnly, no passwordHash in body | server/tests/lab-03/auth.api.test.ts | Pass |
| API-02 | API | AC-05, BR-01 | Login with unknown email vs wrong password | Both 401 with identical body; no Set-Cookie | server/tests/lab-03/auth.api.test.ts | Pass |
| API-03 | API | AC-06, BR-02 | Login as inactive user with correct password / with wrong password | 403 ACCOUNT_INACTIVE / 401 INVALID_CREDENTIALS | server/tests/lab-03/auth.api.test.ts | Pass |
| API-04 | API | AC-07, BR-09 | Logout then reuse cookie on GET /api/auth/me | 204 then 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-05 | API | AC-02, BR-06 | mustChangePassword user calls GET /api/tickets and /api/auth/me | 403 PASSWORD_CHANGE_REQUIRED; /me still 200 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-06 | API | AC-08, BR-05, BR-07 | Change password: wrong current, weak new, mismatch confirm, same as current, valid | 400 per field for the first four; 200 + mustChangePassword false + old password no longer logs in | server/tests/lab-03/auth.api.test.ts | Pass |
| API-07 | API | BR-07 | Change password ends other sessions | Second session's /me → 401; the changing session's /me → 200 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-08 | API | BR-03 | Login with mixed-case / padded email | 200 (normalized) | server/tests/lab-03/auth.api.test.ts | Pass |
| API-09 | API | BR-08 | Expired session (expiresAt in the past) | 401 and cookie cleared | server/tests/lab-03/auth.api.test.ts | Pass |
| SEC-01 | SEC | AC-03, BR-13 | Requester A sends X-Requester-Id / requesterId of B on create + list + detail | Ticket created for A; list shows only A; B's ticket 404 | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-02 | SEC | AC-04, BR-18 | Requester calls GET/POST internal-notes | 403, body has no note content | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-03 | SEC | AC-09, BR-14 | Requester calls every /api/staff/* and /api/admin/* route | 403 FORBIDDEN for each | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-04 | SEC | AC-29, BR-14 | IT Staff calls every /api/admin/* route | 403 FORBIDDEN, no user data | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-05 | SEC | BR-14 | IT Staff **and** Administrator call every Requester-only route: POST/GET /api/tickets, GET /api/tickets/:tn, POST /api/tickets/:tn/attachments, GET /api/attachments/:id, DELETE /api/attachments/:id, POST /api/tickets/:tn/requester-resolved | 403 FORBIDDEN for both roles on each; the shared comment and download routes stay 200 | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-09 | SEC | AC-34, BR-09a | Unsafe requests with a valid cookie but (a) forged Origin, (b) foreign Referer and no Origin, (c) no Origin/Referer, on login, logout, create ticket (multipart), claim, requester-resolved, admin PATCH; plus a GET without Origin | 403 CSRF_REJECTED and no state change for a–c; GET unaffected; matching Origin → normal response | server/tests/lab-03/csrf.api.test.ts | Pass |
| API-35 | API | AC-35, BR-27 | Two IT Staff claim the same unassigned ticket concurrently (Promise.all) | exactly one 200 (owner), one 409 ALREADY_ASSIGNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-36 | API | AC-35, BR-32 | Two concurrent appears-resolved requests by the owner | exactly one 200, one 409 ALREADY_INDICATED | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-37 | API | AC-35, BR-43 | With exactly two active Administrators, both are demoted concurrently | exactly one 200, one 409 LAST_ADMIN; one active Administrator remains | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-38 | API | AC-36, BR-07, BR-44, BR-10 | Transaction failure injected into change-password, initial-password, and deactivation | 500; password hash, activation state, and sessions all unchanged | server/tests/lab-03/atomicity.api.test.ts | Pass |
| SEC-06 | SEC | FR-07, BR-16 | Unauthenticated call to one route of each group | 401 UNAUTHENTICATED for all | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-07 | SEC | AC-30, BR-10 | Admin deactivates a logged-in IT Staff; that user's next request | 401 | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-08 | SEC | BR-15 | Administrator performs claim / status / internal note | 200/201 (explicitly permitted) | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-10 | API | AC-13, AC-14, BR-34 | GET /api/staff/tickets default; search by requester name; filters status/itPriority/categoryId/owner=unassigned/me; sort itPriority asc; pagination metadata; counts | Correct subsets, page metadata, counts.all/unassigned/mine | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-11 | API | AC-14, BR-34 | Invalid query values (page=abc, pageSize=999, status=BOGUS, sortBy=x) | Defaults applied, 200 | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-12 | API | FR-13 | GET /api/staff/assignees | Only active IT_STAFF + ADMIN, inactive excluded | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-13 | API | FR-14 | GET /api/staff/tickets/:ticketNumber for any requester's ticket; unknown number | 200 with requester, category, owner, allowedTransitions, attachments; 404 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-14 | API | AC-15, BR-26, BR-27 | Claim unassigned NEW ticket; claim again as another staff | owner = caller, status OPEN; 409 ALREADY_ASSIGNED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-15 | API | AC-16, BR-23 | PATCH owner to active staff / inactive staff / requester / null | 200 owner changed; 400; 400; 200 unassigned | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-16 | API | AC-17, BR-24 | PATCH it-priority HIGH; invalid value | requestedPriority unchanged, itPriority HIGH; 400 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-17 | API | AC-18, BR-30 | Status walk NEW→OPEN→IN_PROGRESS→RESOLVED→CLOSED→REOPENED; and NEW→CLOSED | 200 each permitted step; 409 INVALID_TRANSITION with allowed list | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-18 | API | AC-19, BR-29 | RESOLVED without owner; unassign a RESOLVED ticket | 409 OWNER_REQUIRED both | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-19 | API | BR-28 | Claim / it-priority / owner on CANCELLED ticket; CLOSED→REOPENED | 409 TICKET_TERMINAL ×3; 200 | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-20 | API | AC-11, BR-35, BR-39 | Requester posts comment on own ticket; staff reads it; staff posts; requester reads both | 201, list ordered asc with author name+role | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-21 | API | AC-21, BR-37 | Comment/note with "", "   ", 2001 chars | 400 fields.body, nothing stored | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-22 | API | BR-38 | Comment on CLOSED ticket; internal note on CLOSED ticket | 409 TICKET_NOT_COMMENTABLE; 201 | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-23 | API | AC-20, BR-35 | Staff creates internal note; requester fetches own ticket detail + comments | Note listed for staff; requester responses contain no note text anywhere | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-24 | API | BR-17 | Requester B reads comments / posts comment on A's ticket | 404 both | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-25 | API | AC-12, BR-32 | Requester marks appears-resolved; again; on CLOSED ticket; staff detail shows it | 200 with requesterResolvedAt, status unchanged; 409 ALREADY_INDICATED; 409 TICKET_TERMINAL; field present | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-26 | API | AC-22 | GET /api/admin/users; search "emily"; search by email fragment; role=IT_STAFF; role=BOGUS | Full list sorted; narrowed; narrowed; only IT_STAFF; filter ignored | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-27 | API | AC-23, BR-20 | POST /api/admin/users valid; then login as the new user | 201 mustChangePassword true, no passwordHash; login 200 then /api/tickets 403 PASSWORD_CHANGE_REQUIRED | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-28 | API | AC-24, BR-40, BR-03 | Create with existing email (different case); PATCH another user to an existing email | 409 EMAIL_TAKEN both | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-29 | API | BR-19, BR-41, BR-05 | Create with blank name, bad email, role=SUPERUSER, weak initialPassword | 400 with each field named | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-30 | API | AC-25 | PATCH name/email/role/isActive | 200 reflected; GET list shows changes | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-31 | API | AC-26, BR-44 | POST initial-password for a logged-in user; that user's /me; login with new password | 200 mustChangePassword true; 401; 200 then forced change | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-32 | API | AC-27, BR-42 | Admin PATCH self isActive=false | 409 SELF_DEACTIVATION, still active | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-33 | API | AC-28, BR-43 | Change the role of the last active admin (the reachable LAST_ADMIN path — deactivating the last admin can only be attempted by that admin, where BR-42 fires first); with a second active admin the change and the deactivation succeed | 409 LAST_ADMIN; 200 with two active admins; deactivated admin's session ends | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-34 | API | BR-45 | DELETE /api/admin/users/:id | 404 (route does not exist) | server/tests/lab-03/users-admin.api.test.ts | Pass |
| MIG-01 | MIG | AC-31, BR-46, BR-46a, BR-47 | Builds a scratch database from the three Lab 2 migrations, inserts Lab 2 fixtures (active + inactive requesters, tickets, attachments), then applies the real Lab 3 migration SQL files | Same user ids/emails/isActive; Ticket FK now references User; attachments intact; itPriority = requestedPriority; updatedAt populated; passwordHash is an `unprovisioned$…` sentinel unique per row; mustChangePassword true | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| MIG-02 | MIG | AC-31, BR-46 | A migrated (unprovisioned) user tries to log in with any password; Administrator provisions an initial password; user logs in | 401 before provisioning (no takeover possible); 200 after, then 403 PASSWORD_CHANGE_REQUIRED until changed | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| MIG-03 | MIG | FR-08 | GET /api/requesters; any route with only X-Requester-Id | 404; 401 | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| MIG-04 | MIG | §7 seed | Run seed twice | Same user/ticket counts, no duplicates | server/tests/lab-03/migration-regression.api.test.ts | Pass |
| UI-01 | UI | AC-01, FR-01 | Login submits email/password, navigates to role home per role | login called; Requester → /tickets, IT Staff → /staff/queue, Admin → /admin/users | client/tests/lab-03/Login.test.tsx | Pass |
| UI-02 | UI | AC-05, AC-06, AC-33 | Login 401 / 403 inactive / network failure | Correct banner each; email kept; busy state during request | client/tests/lab-03/Login.test.tsx | Pass |
| UI-03 | UI | FR-01 | Login with empty fields | Field messages, API not called | client/tests/lab-03/Login.test.tsx | Pass |
| UI-04 | UI | AC-02 | Login as mustChangePassword user; open /tickets directly while flagged | Redirect to /change-password both times | client/tests/lab-03/Login.test.tsx | Pass |
| UI-05 | UI | AC-08, BR-05 | Change Password rule checklist + mismatch + API 400 mapping | Checklist ticks; field messages | client/tests/lab-03/ChangePassword.test.tsx | Pass |
| UI-06 | UI | AC-02 | Successful forced change navigates to role home and clears the flag | Navigates; "Password updated" shown | client/tests/lab-03/ChangePassword.test.tsx | Pass |
| UI-07 | UI | FR-06, AC-07 | Shell shows name + role badge + role-specific nav; Logout calls API and returns to /login | Requester sees My Tickets/Create Ticket only; IT Staff sees Ticket Queue only; Admin sees Queue + Users | client/tests/lab-03/AppShell.test.tsx | Pass |
| UI-08 | UI | AC-09 | Requester opens /staff/queue and /admin/users | Forbidden card, no API data rendered | client/tests/lab-03/RequireAuth.test.tsx | Pass |
| UI-09 | UI | AC-07, FR-03 | Unauthenticated user opens /tickets; /me 401 | Redirect to /login | client/tests/lab-03/RequireAuth.test.tsx | Pass |
| UI-22 | UI | AC-30 | A 401 arriving mid-session (apiFetch and the attachment download) clears the auth context and returns to Login | Login screen shown; no stale page remains | client/tests/lab-03/SessionExpiry.test.tsx | Pass |
| UI-10 | UI | AC-13 | Queue renders rows with all columns, badges, counts chips | Columns/badges/chips present | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-11 | UI | AC-14 | Search, status filter, owner chip "Mine", sort toggle, Next page | API called with matching query each time; stale-response guard | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-12 | UI | §1.5 | Queue empty / no-results / failure states | Correct state + Clear Filters / Retry | client/tests/lab-03/StaffTicketQueue.test.tsx | Pass |
| UI-13 | UI | AC-15, AC-16 | Detail: Claim calls claim API; 409 switches to Reassign; Reassign select lists assignees and saves | API calls + UI updates | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-14 | UI | AC-17 | IT Priority select saves; Requested Priority badge unchanged | PATCH called; "Saved" shown | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-15 | UI | AC-18, AC-19, BR-31 | Status select shows only allowedTransitions; CLOSED asks confirmation; 409 OWNER_REQUIRED alert shown | Options restricted; confirm dialog; alert text | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-16 | UI | AC-20, BR-35 | Internal Notes tab visually marked private; note posts and lists; Public Comments separate | Private caption present; lists update | client/tests/lab-03/StaffTicketDetail.test.tsx | Pass |
| UI-17 | UI | AC-11, AC-12 | Requester Detail: post comment; appears-resolved confirm + chip; closed-ticket composer disabled | API called; chip rendered; disabled note | client/tests/lab-03/RequesterComments.test.tsx | Pass |
| UI-18 | UI | AC-22 | Users list renders Name/Email/Role/Status/Edit; search + role filter call API | Rendered; API query matches | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-19 | UI | AC-23, AC-24 | Create user: validation, 409 EMAIL_TAKEN on email field, success adds row | Field messages; row appended | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-20 | UI | AC-25, AC-26, AC-27 | Edit user saves; Set Initial Password confirm + call; self Active toggle disabled; LAST_ADMIN 409 alert | API calls; disabled toggle; alert | client/tests/lab-03/UserManagement.test.tsx | Pass |
| UI-21 | UI | AC-29, AC-33 | Users screen as IT Staff; list load failure | Forbidden card; failure + Retry | client/tests/lab-03/UserManagement.test.tsx | Pass |
| RESP-01 | RESP | AC-32 | Desktop/tablet/mobile screenshots + no-horizontal-scroll + column-count assertions for Login/Change Password, Queue (table vs cards), IT Staff Detail (3/2/1 columns), Users | All assertions pass at 3 viewports; 12 screenshots saved | e2e/lab-03/responsive.spec.ts | Pass |
| E2E-01 | E2E | AC-01, AC-05, AC-07 | Login invalid → valid as Requester → shell shows name/role → logout → protected URL redirects to login | Flow passes | e2e/lab-03/authentication.spec.ts | Pass |
| E2E-02 | E2E | AC-02 | First-login user: login → forced Change Password → normal app opens only after valid change | Flow passes | e2e/lab-03/authentication.spec.ts | Pass |
| E2E-03 | E2E | AC-10 | Requester creates a ticket and finds it in My Tickets with the authenticated identity (no selector) | Flow passes | e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| E2E-04 | E2E | AC-13..AC-20 | IT Staff: queue search → open detail → claim → set IT Priority → In Progress → internal note → public comment → Resolved → Closed; Requester sees public comment but no note | Flow passes | e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| E2E-05 | E2E | AC-22..AC-28 | Admin: create user with initial password → new user logs in and is forced to change → admin edits role → self-deactivation blocked | Flow passes | e2e/lab-03/user-administration.spec.ts | Pass |

## 3. Migrated Lab 2 Regression Suite

The Lab 2 test files keep their names and their Lab 2 AC references; they now authenticate through
`loginAs()` instead of `X-Requester-Id`. Rows whose subject no longer exists (the selector) are
replaced as noted.

| Lab 2 Test ID | File (after migration) | Change | Final |
|---|---|---|---|
| UNIT-01 | server/tests/lab-02/ticket-number.unit.test.ts | unchanged | Pass |
| API-01..03, API-13 | server/tests/lab-02/create-ticket.api.test.ts | cookie auth | Pass |
| API-04, API-05, API-09, API-10 | server/tests/lab-02/attachments.api.test.ts | cookie auth | Pass |
| API-06, API-07 | server/tests/lab-02/my-tickets.api.test.ts | cookie auth | Pass |
| API-08, API-14 | server/tests/lab-02/ticket-detail.api.test.ts | cookie auth | Pass |
| API-11 | server/tests/lab-02/requesters.api.test.ts | replaced: asserts `GET /api/requesters` is gone (404) — see MIG-03 | Pass |
| API-12 | server/tests/lab-02/auth-context.api.test.ts | replaced: missing/expired cookie and stray X-Requester-Id → 401 | Pass |
| UI-02, UI-03, UI-18 | client/tests/lab-02/DevRequesterSelect.test.tsx | removed (selector deleted); behaviours covered by UI-01..UI-04 | — |
| UI-04 | client/tests/lab-02/RouteGuard.test.tsx | replaced by client/tests/lab-03/RequireAuth.test.tsx (UI-09) | — |
| UI-05..UI-09 | client/tests/lab-02/CreateTicket.test.tsx | AuthProvider instead of RequesterProvider | Pass |
| UI-10..UI-13 | client/tests/lab-02/MyTickets.test.tsx | AuthProvider; status filter lists all statuses | Pass |
| UI-14 | client/tests/lab-02/RequesterTicketDetail.test.tsx | AuthProvider; new Owner / IT Priority fields | Pass |
| UI-15, UI-16 | client/tests/lab-02/AttachmentSection.test.tsx | no requesterId prop | Pass |
| UI-17 | client/tests/lab-02/AppShell.test.tsx | replaced by client/tests/lab-03/AppShell.test.tsx (UI-07) | — |
| RESP-01, E2E-01, E2E-02 | e2e/lab-02/*.spec.ts | login as seeded Requester instead of selecting one | Pass |

## 4. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, UI-01, E2E-01 |
| AC-02 | API-05, UI-04, UI-06, E2E-02, MIG-02 |
| AC-03 | SEC-01 |
| AC-04 | SEC-02 |
| AC-05 | API-02, UI-02, E2E-01 |
| AC-06 | API-03, UI-02 |
| AC-07 | API-04, UI-07, UI-09, E2E-01 |
| AC-08 | API-06, UI-05 |
| AC-09 | SEC-03, UI-08 |
| AC-10 | §3 regression suite, E2E-03 |
| AC-11 | API-20, UI-17, E2E-04 |
| AC-12 | API-25, UI-17 |
| AC-13 | API-10, UI-10, E2E-04 |
| AC-14 | API-10, API-11, UI-11 |
| AC-15 | API-14, UI-13, E2E-04 |
| AC-16 | API-15, UI-13 |
| AC-17 | API-16, UI-14, E2E-04 |
| AC-18 | API-17, UI-15, E2E-04 |
| AC-19 | API-18, UI-15 |
| AC-20 | API-23, UI-16, E2E-04 |
| AC-21 | API-21 |
| AC-22 | API-26, UI-18 |
| AC-23 | API-27, UI-19, E2E-05 |
| AC-24 | API-28, UI-19 |
| AC-25 | API-30, UI-20, E2E-05 |
| AC-26 | API-31, UI-20 |
| AC-27 | API-32, UI-20, E2E-05 |
| AC-28 | API-33, UI-20 |
| AC-29 | SEC-04, UI-21 |
| AC-30 | SEC-07, UI-22 |
| AC-31 | MIG-01, MIG-02 |
| AC-32 | RESP-01 |
| AC-33 | UI-02, UI-12, UI-21 |
| AC-34 | SEC-09 |
| AC-35 | API-35, API-36, API-37 |
| AC-36 | API-38 |

## 5. Responsive and Visual Checklist

See `ui-spec.md` §12 — completed during Issue 6 alongside RESP-01, with screenshots saved under
`artifacts/lab-03/screenshots/`.

## 6. Test Commands

```bash
cd server && npm test    # unit + API + SEC + MIG tests (Vitest + Supertest; needs the seeded DB)
cd client && npm test    # UI tests (Vitest + Testing Library)
cd e2e && npm test       # E2E + responsive screenshots (Playwright; needs both dev servers
                          # running and the DB seeded — see README.md)
```

## 7. Final Results

Run on the final Lab 3 branch (feature/16-e2e-qa-release, identical content to the `lab3-staging`
release) on 2026-10-04, after the peer-review fixes, against a freshly reset and seeded database
(`npx prisma migrate reset`):

```
$ cd server && npm test
 ✓ tests/lab-01/categories.test.ts (1 test)
 ✓ tests/lab-01/health.test.ts (1 test)
 ✓ tests/lab-02/attachments.api.test.ts (8 tests)
 ✓ tests/lab-02/auth-context.api.test.ts (5 tests)
 ✓ tests/lab-02/create-ticket.api.test.ts (5 tests)
 ✓ tests/lab-02/my-tickets.api.test.ts (5 tests)
 ✓ tests/lab-02/requesters.api.test.ts (2 tests)
 ✓ tests/lab-02/ticket-detail.api.test.ts (3 tests)
 ✓ tests/lab-02/ticket-number.unit.test.ts (1 test)
 ✓ tests/lab-03/atomicity.api.test.ts (3 tests)
 ✓ tests/lab-03/auth.api.test.ts (11 tests)
 ✓ tests/lab-03/authorization.api.test.ts (31 tests)
 ✓ tests/lab-03/comments-notes.api.test.ts (10 tests)
 ✓ tests/lab-03/csrf.api.test.ts (6 tests)
 ✓ tests/lab-03/migration-regression.api.test.ts (5 tests)
 ✓ tests/lab-03/password.unit.test.ts (12 tests)
 ✓ tests/lab-03/staff-queue.api.test.ts (7 tests)
 ✓ tests/lab-03/staff-ticket-detail.api.test.ts (10 tests)
 ✓ tests/lab-03/status-transitions.unit.test.ts (11 tests)
 ✓ tests/lab-03/users-admin.api.test.ts (13 tests)
 Test Files  20 passed (20)
      Tests  150 passed (150)        # run twice in a row; 150/150 both times

$ cd client && npm test
 ✓ tests/lab-01/App.test.tsx (3 tests)
 ✓ tests/lab-02/AttachmentSection.test.tsx (5 tests)
 ✓ tests/lab-02/CreateTicket.test.tsx (7 tests)
 ✓ tests/lab-02/MyTickets.test.tsx (6 tests)
 ✓ tests/lab-02/RequesterTicketDetail.test.tsx (2 tests)
 ✓ tests/lab-03/AppShell.test.tsx (5 tests)
 ✓ tests/lab-03/ChangePassword.test.tsx (5 tests)
 ✓ tests/lab-03/Login.test.tsx (9 tests)
 ✓ tests/lab-03/RequesterComments.test.tsx (4 tests)
 ✓ tests/lab-03/RequireAuth.test.tsx (5 tests)
 ✓ tests/lab-03/SessionExpiry.test.tsx (4 tests)
 ✓ tests/lab-03/StaffTicketDetail.test.tsx (7 tests)
 ✓ tests/lab-03/StaffTicketQueue.test.tsx (7 tests)
 ✓ tests/lab-03/UserManagement.test.tsx (6 tests)
 Test Files  14 passed (14)
      Tests  75 passed (75)

$ cd e2e && npm test        # lab-02 (5 tests) + lab-03 (11 tests) × desktop/tablet/mobile
  48 passed (1.3m)
```

Totals: **150 server** (34 migrated Lab 2 regression + 116 Lab 3: 23 unit, 55 API incl. CSRF /
concurrency / atomicity, 31 authorization, 5 migration) · **75 client** (20 migrated Lab 2 + 3 Lab 1
+ 52 Lab 3) · **48 E2E/responsive** (16 scenarios × 3 viewports) — 273 automated checks, 0 skipped.

## 8. Known Limitations or Deferred Tests

- No login-attempt lockout / rate limiting (excluded by the handout); documented in BR-11.
- Session cookie `Secure` flag is only exercised in production mode; tests run in development mode.
- Accessibility is checked manually per `ui-spec.md` §11; no automated a11y scanner in Lab 3.
- Load testing of the queue at large volumes is deferred.
