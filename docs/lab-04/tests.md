# Lab 4 Test Plan and Results

## 1. Test Strategy

Tests are planned here from `specification.md` before implementation (Test DD) and written failing
first per Issue (TDD). Every Lab 4 Acceptance Criterion (AC-01..AC-30) maps to at least one row in
§2; every Lab 2 and Lab 3 test stays in the regression suite (§3). **Final** started as `Planned` and
became `Pass` once the test passed on the integrated Lab 4 branch `integration/lab4-stack` — the
reviewed stack plus the PR #61 review fix — which is what `lab4-staging` and then `main` receive (§6).

| Type | Tool | Scope |
|---|---|---|
| Unit | Vitest | pure rules: action transitions, field validation, resolution gate, gated Ticket transitions |
| API | Vitest + Supertest, real Express app + Postgres | endpoints, authorization, workflow, concurrency, dashboard calculations |
| SEC | Supertest | role / ownership / CSRF evidence for every new route |
| MIG | Vitest + scratch database | Lab 3 → Lab 4 migration, rollback, re-apply, seed idempotency |
| PERF | Supertest timing | dashboard response-time smoke |
| UI | Vitest + Testing Library (API mocked) | components, modes, validation placement, drill-down links |
| STYLE | Vitest + Testing Library | badge / class maps, text labels (non-colour cues) |
| RESP | Playwright | desktop / tablet / mobile screenshots + no horizontal overflow |
| E2E | Playwright against both dev servers + seeded DB | full user journeys across roles |
| REG | the complete Lab 1–3 suites | regression |

API tests reuse `server/tests/helpers/auth.ts` (`api()` sends the client `Origin`; `loginAs()`,
`asStaff()`, …). Dashboard tests never assert fixed numbers — other test files add Tickets
concurrently — they compare every metric with a direct Prisma count of its BR-28/BR-29 definition
and with the `totalItems` of its drill-down query.

## 2. Planned Tests (Lab 4)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-08 | Action transition matrix: every (from, to) pair, create targets | Exactly the BR-08 pairs allowed; COMPLETED / CANCELLED have none | server/tests/lab-04/actions.unit.test.ts | Pass |
| UNIT-02 | Unit | BR-04..BR-07 | `validateAction` boundaries: description 4/5/1000/1001, result required on COMPLETED, follow-up note required, attachment notes 500/501, actionAt before ticket / future by status | Field errors exactly as api-spec; valid input normalised (trim, note null when follow-up off) | server/tests/lab-04/actions.unit.test.ts | Pass |
| UNIT-03 | Unit | BR-20 | `resolutionBlockers()` for: no owner, no actions, only cancelled, open action, latest completed needs follow-up, older follow-up superseded | Correct blocker list each; `[]` only when all conditions hold | server/tests/lab-04/actions.unit.test.ts | Pass |
| UNIT-04 | Unit | BR-18, BR-21 | `gatedTransitions()` removes RESOLVED when blocked, keeps matrix otherwise | Matrix unchanged from L3; RESOLVED filtered | server/tests/lab-04/actions.unit.test.ts | Pass |
| API-01 | API | AC-01, BR-03 | IT Staff creates a valid action (no performer given) | 201; ticketId correct; performedBy = createdBy = caller; createdAt/updatedAt/completedAt server-set; version 1 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-02 | API | AC-01, AC-02, BR-02, BR-03 | Staff A creates an action performed by Staff B on a Ticket owned by Staff C | 201; performedBy B, createdBy A, Ticket owner unchanged | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-03 | API | AC-02, BR-16 | Two staff record three actions (two with identical actionAt) | GET lists all three, actionAt asc then id asc | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-04 | API | AC-03, BR-03 | performedById = inactive staff / requester / unknown id, on create and on edit | 400 `fields.performedById`; nothing stored / changed | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-05 | API | AC-04, BR-04..BR-07 | Short description, follow-up without note, COMPLETED without result, actionAt before ticket, completed action in the future, attachment notes 501 chars, bad status | 400 naming every field; action count unchanged | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-06 | API | AC-05, BR-08 | Edit open action fields; PLANNED → IN_PROGRESS → COMPLETED (with result); another PLANNED → CANCELLED | 200 each; version increments; completedAt / cancelledAt set | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-07 | API | AC-05, BR-08, BR-09 | Edit a COMPLETED action; CANCELLED → IN_PROGRESS; IN_PROGRESS → PLANNED | 409 ACTION_FINAL; 409 ACTION_FINAL; 409 INVALID_ACTION_TRANSITION with allowed | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-08 | API | AC-06, BR-13 | Two PATCHes from the same version (sequential and concurrent); PATCH without version | first 200, second 409 STALE_UPDATE with `current`; 400 version | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-09 | API | AC-07, BR-14 | Same create sent twice sequentially and twice concurrently with one clientRequestId; reuse on another ticket | one row; 201 + 200 returning the same id; 409 DUPLICATE_REQUEST | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-09b | API | AC-07, BR-14 | Same clientRequestId posted concurrently to two different tickets, six rounds (review on PR #61) | one 201 and one 409 DUPLICATE_REQUEST every round; the loser never receives the other ticket's action | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-10 | API | AC-09, BR-10 | Create / edit on RESOLVED, CLOSED, CANCELLED Tickets | 409 TICKET_NOT_WORKABLE each | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-11 | API | BR-01 | PATCH an action through another Ticket's URL; unknown ticket | 404 both; action unchanged | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| SEC-01 | SEC | AC-08, BR-15 | Requester: GET/POST/PATCH staff action routes; GET own ticket actions; GET another requester's ticket actions; IT Staff on the Requester route | 403 ×3; 200 read-only list; 404; 403 | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| SEC-02 | SEC | AC-23, BR-26 | Unauthenticated action routes; POST/PATCH action with forged Origin | 401; 403 CSRF_REJECTED, nothing stored | server/tests/lab-04/actions-taken.api.test.ts | Pass |
| API-12 | API | AC-10, BR-18 | Every (from, to) status pair via PATCH status (gate satisfied where RESOLVED) | exactly the BR-18 matrix 200; others 409 INVALID_TRANSITION with allowed | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-13 | API | AC-11, BR-20 | Resolve with: no owner; no actions; only cancelled action; an open action; latest completed needs follow-up — via the raw API | 409 OWNER_REQUIRED; RESOLUTION_BLOCKED with NO_COMPLETED_ACTION / NO_COMPLETED_ACTION / OPEN_ACTIONS / FOLLOW_UP_PENDING; status and version unchanged | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-14 | API | AC-12, BR-23, BR-24 | Resolve when the gate holds; close; reopen | RESOLVED + resolvedAt + version+1 + history row; CLOSED keeps resolvedAt; REOPENED clears it | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-15 | API | AC-17, BR-21 | Staff detail while blocked and after the gate holds | allowedTransitions without / with RESOLVED; resolution.blockers matches; actionCounts correct | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-16 | API | AC-14, BR-24 | Create ticket (requester) → claim → transitions; staff and requester detail | history: null→NEW, NEW→OPEN, …, oldest first, actor + time; requester detail has the same history and no internal fields | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-17 | API | AC-15, BR-25, BR-26 | Stale expectedVersion on status / owner / it-priority / claim; two concurrent identical status PATCHes without expectedVersion | 409 STALE_UPDATE with current ×4; exactly one 200 and one 409, one history row | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-18 | API | AC-16, BR-11 | Cancel a Ticket with one PLANNED, one IN_PROGRESS, one COMPLETED action | open actions CANCELLED with cancelledAt; completed unchanged; history row | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-19 | API | AC-13, BR-22 | Requester marks appears-resolved | status unchanged; staff dashboard appearsResolved includes it | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| SEC-03 | SEC | AC-10, BR-18 | Requester PATCH status / owner on own ticket | 403 FORBIDDEN, nothing changes | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| API-20 | API | AC-18, BR-28 | Requester A and B dashboards after each creates tickets | every listed ticket belongs to the caller; B's tickets never in A's response | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-21 | API | AC-19, BR-28, BR-34 | Each Requester metric vs direct Prisma count and vs GET /api/tickets with its `query` | all three numbers equal for every metric | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-22 | API | AC-20, BR-31 | Fresh Requester with no tickets | all metrics 0, all lists [] , 200 | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-23 | API | BR-27, BR-28 | List rules: needsAttention statuses + order, recentlyUpdated order, recentlyResolved window (8-day-old resolvedAt excluded), ≤ 5 rows | as specified | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| SEC-04 | SEC | AC-23, BR-33 | IT Staff / Admin call requester dashboard; unauthenticated | 403 ×2; 401 | server/tests/lab-04/requester-dashboard.api.test.ts | Pass |
| API-24 | API | AC-19, BR-29, BR-34 | Each staff metric vs direct Prisma count and vs GET /api/staff/tickets with its `query` | all equal | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-25 | API | AC-21, BR-29, BR-30 | myOpenActions for Staff A vs B; admin userCounts vs Prisma; IT Staff has no userCounts | only caller's open actions on workable tickets; counts equal; key absent | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-26 | API | BR-29 | byStatus sums to total tickets; byItPriority sums to active tickets; urgent / recentlyUpdated ordering, ≤ 5 | as specified | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-27 | API | AC-20, BR-31 | Fresh IT Staff user | mine 0, myOpenActions 0 and [], response 200 | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| API-28 | API | BR-35 | `statusGroup=active` on both lists, `appearsResolved=true` on queue, combined with owner / itPriority; unknown values ignored | correct subsets; defaults on bad values | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| SEC-05 | SEC | AC-23, BR-33 | Requester calls staff dashboard; unauthenticated | 403; 401 | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| PERF-01 | PERF | AC-30 | 5 sequential calls to each dashboard with the full test DB | each < 500 ms | server/tests/lab-04/staff-dashboard.api.test.ts | Pass |
| MIG-05 | MIG | AC-25, BR-36 | Build Lab 3 DB from the real migrations + fixtures (tickets in NEW / RESOLVED / CLOSED, comment, note, attachment); apply Lab 4 migration; run rollback; re-apply | rows intact, no actions, version 1, one history row each, resolvedAt back-filled; rollback removes only Lab 4 objects; re-apply succeeds | server/tests/lab-04/migration.api.test.ts | Pass |
| MIG-06 | MIG | AC-26 | Run seed twice | identical counts of seeded actions and history; zero / one / multiple actions present | server/tests/lab-04/migration.api.test.ts | Pass |
| UI-01 | UI | FR-12, AC-22 | StaffDashboard renders all metric cards with values; each card's href is the queue URL from `query`; rows link to Ticket Detail | as specified | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-02 | UI | AC-20, AC-21, AC-24 | StaffDashboard loading, failure + Retry, all-zero ("0" + empty lines), Admin userCounts card shown only when present | as specified | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| UI-03 | UI | FR-11, AC-18, AC-22 | RequesterDashboard cards link to `/tickets?…`; attention reasons; lists | as specified | client/tests/lab-04/RequesterDashboard.test.tsx | Pass |
| UI-04 | UI | AC-20, AC-24 | RequesterDashboard loading, failure + Retry, all-zero | as specified | client/tests/lab-04/RequesterDashboard.test.tsx | Pass |
| UI-05 | UI | FR-01, FR-05, AC-08 | ActionsTaken list: fields, follow-up badge, attachment notes, "recorded by", empty state; read-only mode has no Add / Edit | as specified | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-06 | UI | AC-04, AC-07 | Create form: Follow-up Note appears + required, description / result errors under fields, server 400 mapped, network failure keeps values, retry reuses the same clientRequestId | as specified | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-07 | UI | AC-05, AC-06 | Edit mode: save, Start, Complete (result required), Cancel Action confirm; 409 STALE_UPDATE shows amber alert and keeps draft | as specified | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| STYLE-01 | STYLE | AC-29, ui-spec §1.1 | Action status badge classes and text labels; follow-up badge text | single map, every badge has text | client/tests/lab-04/ActionsTaken.test.tsx | Pass |
| UI-08 | UI | AC-12, AC-15, AC-17 | Status control: options = allowedTransitions; blocked checklist; request carries expectedVersion; STALE_UPDATE message; success refreshes header badge | as specified | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-09 | UI | AC-14 | History tab: entries oldest first, actor + role, "System (migration)" for null actor; Requester status history section | as specified | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-10 | UI | BR-35, AC-22 | My Tickets / Queue initialise filters from URL (`statusGroup`, `currentStatus`, `owner`, `itPriority`, `appearsResolved`) and send them to the API | request query matches URL | client/tests/lab-04/TicketWorkflow.test.tsx | Pass |
| UI-11 | UI | FR-15, BR-38 | Shell: Dashboard first for each role, `aria-current="page"` on the active link; `/` redirects to `/dashboard` | as specified | client/tests/lab-04/StaffDashboard.test.tsx | Pass |
| E2E-01 | E2E | AC-01, AC-02, AC-05, AC-08 | Staff A lands on Dashboard → opens a ticket → adds Planned action → edits → Start → Complete; Staff B adds another action; Requester sees both read-only | as specified, through the real UI | e2e/lab-04/actions-taken-flow.spec.ts | Pass |
| E2E-02 | E2E | AC-11, AC-12, AC-14, AC-17 | Resolved not offered + checklist → complete action → resolve → header badge, History; Requester sees Resolved + history | as specified | e2e/lab-04/ticket-resolution.spec.ts | Pass |
| E2E-03 | E2E | AC-19, AC-22 | Requester card → My Tickets count equals card; Staff "Unassigned" card → Queue count equals card; Admin sees User accounts | equal numbers | e2e/lab-04/dashboards.spec.ts | Pass |
| A11Y-01 | E2E | AC-29 | Keyboard only: Tab to a metric card, visible focus, Enter navigates; Tab through action form | as specified | e2e/lab-04/dashboards.spec.ts | Pass |
| HARD-01 | API | FR-18 | GET /api/auth/session signed out / dead cookie / signed in; /me unchanged | 200 user null (cookie cleared) / 200 user; /me still 401 — the sign-in page logs no failed request | server/tests/lab-04/ticket-workflow.api.test.ts | Pass |
| RESP-01 | RESP | AC-28 | Requester Dashboard, Staff Dashboard, Admin Dashboard, Actions Taken (list + form) at 1280 / 820 / 390 px | no horizontal overflow; screenshots saved to artifacts/lab-04/screenshots/ | e2e/lab-04/responsive.spec.ts | Pass |

## 3. Regression Suite (Labs 1–3)

| Test ID | Type | Scope | Files | Final |
|---|---|---|---|---|
| REG-01 | API / Unit / MIG | All Lab 1, Lab 2, Lab 3 server tests (health, categories, create ticket, My Tickets, detail, attachments, auth, CSRF, authorization, queue, staff detail, comments / notes, users admin, atomicity, migration) | server/tests/lab-01/, lab-02/, lab-03/ | Pass |
| REG-02 | UI | All Lab 1, Lab 2, Lab 3 client tests | client/tests/lab-01/, lab-02/, lab-03/ | Pass |
| REG-03 | E2E / RESP | Lab 2 Requester flow + responsive; Lab 3 authentication, staff flow, user administration, responsive | e2e/lab-02/, e2e/lab-03/ | Pass |

Amendment handled in the regression suites: landing page is `/dashboard` for every role (BR-38);
tests that asserted the Lab 3 landing page are updated to the new destination, not deleted.

## 4. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-01, API-02, E2E-01 |
| AC-02 | API-02, API-03, E2E-01 |
| AC-03 | API-04 |
| AC-04 | API-05, UNIT-02, UI-06 |
| AC-05 | API-06, API-07, UI-07, E2E-01 |
| AC-06 | API-08, UI-07 |
| AC-07 | API-09, API-09b, UI-06 |
| AC-08 | SEC-01, UI-05, E2E-01 |
| AC-09 | API-10 |
| AC-10 | API-12, UNIT-04, SEC-03 |
| AC-11 | API-13, UNIT-03, E2E-02 |
| AC-12 | API-14, UI-08, E2E-02 |
| AC-13 | API-19 |
| AC-14 | API-16, UI-09, E2E-02 |
| AC-15 | API-17, UI-08 |
| AC-16 | API-18 |
| AC-17 | API-15, UNIT-04, UI-08, E2E-02 |
| AC-18 | API-20, UI-03 |
| AC-19 | API-21, API-24, E2E-03 |
| AC-20 | API-22, API-27, UI-02, UI-04 |
| AC-21 | API-25, UI-02 |
| AC-22 | UI-01, UI-03, UI-10, E2E-03 |
| AC-23 | SEC-02, SEC-04, SEC-05 |
| AC-24 | UI-02, UI-04 |
| AC-25 | MIG-05 |
| AC-26 | MIG-06 |
| AC-27 | REG-01, REG-02, REG-03 |
| AC-28 | RESP-01 |
| AC-29 | STYLE-01, A11Y-01 |
| AC-30 | PERF-01 |
| FR-18 (hardening) | HARD-01, UI-06 (data kept after failure), UI-06 (no double submit) |

## 5. Test Commands

```bash
cd server && npm test                 # Lab 1–4 API, unit, migration, perf-smoke
cd client && npm test                 # Lab 1–4 UI
cd e2e && npm test                    # Lab 2–4 E2E + responsive (both dev servers running, DB seeded)
```

## 6. Final Results

Run on `integration/lab4-stack` (all six reviewed Issues plus the PR #61 review fix) on
2026-11-01 — the exact content merged into `lab4-staging` and released to `main`. E2E ran against a
freshly migrated and seeded database (`toktickit_demo`).

| Suite | Command | Result |
|---|---|---|
| Server — unit, API, SEC, MIG, PERF (Labs 1–4) | `cd server && npm test` | **26 files, 205 tests passed** (Labs 1–3: 150, Lab 4: 55 in 6 files) |
| Client — UI, STYLE (Labs 1–4) | `cd client && npm test` | **18 files, 106 tests passed** (Lab 4: 31 in 4 files) |
| E2E + responsive (Labs 2–4, desktop / tablet / mobile) | `cd e2e && npm test` | **64 passed, 14 skipped, 0 failed** |

- The 14 skips are by design: the Lab 4 flow specs (`actions-taken-flow`, `ticket-resolution`,
  `dashboards`) run at desktop width only; responsive behaviour at all three widths is RESP-01.
- PERF-01 on a 5,697-ticket test database: staff dashboard 48–79 ms, requester dashboard 19–36 ms
  (limit 500 ms).
- Stability: the full server suite was run 10 consecutive times green after the two flake fixes
  described in §7, then 8 more times after the dashboard tests were added.
- Regression amendments (BR-38), none deleted: 4 Lab 3 server tests record a completed action
  before resolving; Lab 3 UI tests expect `/dashboard` as home, the new `expectedVersion`
  argument, mock the new loaders, and open Public Comments explicitly; Lab 2/3 E2E helpers assert
  `/dashboard` and then continue from the page the spec was written for.

## 7. Known Limitations or Deferred Tests

- **Two flake causes found and fixed during Issue 3.** (1) Supertest connects to `127.0.0.1` but
  binds `[::]`; on macOS other local apps hold `127.0.0.1` ports in the ephemeral range, so a
  request could reach them (foreign 404s, "socket hang up"). `server/tests/setup.ts` makes
  Supertest connect over `[::1]`. (2) Lab 3's queue computed `totalItems` and `counts.*` in
  separate READ COMMITTED statements; they now share one REPEATABLE READ snapshot.
- **Global dashboard metrics under parallel tests.** API-24 / API-26 compare dashboard, direct
  count, and drill-down total for metrics that span all Tickets while other files create Tickets
  concurrently, so they retry (with back-off) until one reading of all three is exactly equal.
  Caller-scoped metrics (Requester dashboard, My Assigned, My Open Actions) use fresh users and are
  compared exactly on the first reading.
- **Time zone.** Dates are stored in UTC and shown in the browser's local time; the recent window
  is rolling (7 × 24 h), so no calendar-day boundary is tested.
- **Lab 2/3 screenshots.** Re-running `e2e/lab-02|lab-03/responsive.spec.ts` rewrites
  `artifacts/lab-02|lab-03/screenshots/` with the new Dashboard nav; the committed Lab 2/3
  screenshots are left as submitted for those labs.
