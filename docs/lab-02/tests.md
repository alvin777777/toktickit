# Lab 2 Test Plan and Results

## 1. Test Strategy

Tests are planned from `specification.md` before implementation (Test DD), then written failing and
implemented against until green (TDD), per Issue. Every Acceptance Criterion (AC-01..AC-21) maps to
at least one row below. Status in the **Final** column starts as `Planned` and is updated to `Pass`
as each Issue's tests are implemented and pass on `main`.

## 2. Planned Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01 | Ticket Number generator format/uniqueness | Matches `TKT-YYYY-NNNNNN`, unique across concurrent creates | server/tests/lab-02/ticket-number.unit.test.ts | Pass |
| API-01 | API | AC-01 | POST /api/tickets with valid data | 201, ticket saved, ticketNumber returned | server/tests/lab-02/create-ticket.api.test.ts | Pass |
| API-02 | API | AC-04 | POST /api/tickets missing summary | 400 with field error, no row created | server/tests/lab-02/create-ticket.api.test.ts | Pass |
| API-03 | API | AC-05 | POST /api/tickets missing description | 400 with field error, no row created | server/tests/lab-02/create-ticket.api.test.ts | Pass |
| API-04 | API | AC-06, BR-16 | POST attachment when 5 already active | 400, existing 5 untouched | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-05 | API | AC-07, BR-16 | POST attachment oversized/unsupported type | 400, no file stored | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-06 | API | AC-03, BR-11 | GET /api/tickets as Requester B | Only B's tickets returned, none of A's | server/tests/lab-02/my-tickets.api.test.ts | Pass |
| API-07 | API | AC-11, AC-12, BR-12, BR-13 | GET /api/tickets search + pagination | Correct filtered subset and page metadata | server/tests/lab-02/my-tickets.api.test.ts | Pass |
| API-08 | API | AC-03, BR-22 | GET /api/tickets/:ticketNumber for non-owner | 404, identical to nonexistent ticket | server/tests/lab-02/ticket-detail.api.test.ts | Pass |
| API-09 | API | AC-14 | POST /api/tickets/:ticketNumber/attachments | 201, attachment linked to ticket | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-10 | API | AC-15, AC-16, BR-18 | DELETE attachment then GET download | Soft-removed; subsequent download returns 404 | server/tests/lab-02/attachments.api.test.ts | Pass |
| API-11 | API | BR-09 | GET /api/requesters | Only isActive=true requesters returned | server/tests/lab-02/requesters.api.test.ts | Pass |
| API-12 | API | BR-09 | Any Requester-scoped endpoint with missing/unknown/inactive X-Requester-Id | 401 consistently across endpoints | server/tests/lab-02/auth-context.api.test.ts | Pass |
| API-13 | API | AC-21, BR-15 | POST /api/tickets with one valid + one invalid attachment | 201; ticket saved; valid attachment linked; response reports the failed one and why | server/tests/lab-02/create-ticket.api.test.ts | Pass |
| API-14 | API | AC-13 | GET /api/tickets/:ticketNumber for the owning Requester | 200; returned fields and attachments match stored data | server/tests/lab-02/ticket-detail.api.test.ts | Pass |
| UI-02 | UI | AC-17 | Requester Selection loading state | Skeleton row shown, dropdown hidden, Continue disabled | client/tests/lab-02/DevRequesterSelect.test.tsx | Pass |
| UI-03 | UI | AC-18 | Requester Selection with zero active requesters | Empty state shown, no dropdown, Continue disabled | client/tests/lab-02/DevRequesterSelect.test.tsx | Pass |
| UI-04 | UI | AC-02 | Opening My Tickets with no Requester selected | Redirects to Requester Selection | client/tests/lab-02/RouteGuard.test.tsx | Pass |
| UI-18 | UI | FR-02 | Select a requester and click Continue | Context + localStorage updated; navigates to My Tickets | client/tests/lab-02/DevRequesterSelect.test.tsx | Pass |
| UI-05 | UI | AC-04 | Submit Create Ticket with empty Summary | Field message shown, API not called | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| UI-06 | UI | AC-05 | Submit Create Ticket with empty Description | Field message shown, API not called | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| UI-07 | UI | AC-07 | Select an oversized/invalid-type file | Rejected client-side before any upload call | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| UI-08 | UI | AC-08 | Create Ticket submit while API is down | Error banner shown; field values preserved | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| UI-09 | UI | AC-01 | Create Ticket success | Confirmation panel shows generated Ticket Number | client/tests/lab-02/CreateTicket.test.tsx | Pass |
| UI-10 | UI | AC-09, BR-21 | My Tickets with zero owned tickets | Empty state (not no-results) shown | client/tests/lab-02/MyTickets.test.tsx | Pass |
| UI-11 | UI | AC-10, BR-21 | My Tickets with filters matching nothing | No-results state + Clear Filters shown | client/tests/lab-02/MyTickets.test.tsx | Pass |
| UI-12 | UI | AC-11 | My Tickets search box | List narrows to matching tickets only | client/tests/lab-02/MyTickets.test.tsx | Pass |
| UI-13 | UI | AC-12 | My Tickets pagination controls | Correct page of results loads | client/tests/lab-02/MyTickets.test.tsx | Pass |
| UI-14 | UI | AC-13 | Ticket Detail header rendering | All fields read-only, match stored ticket | client/tests/lab-02/RequesterTicketDetail.test.tsx | Pass |
| UI-15 | UI | AC-14 | Add attachment from Ticket Detail | New attachment appears without full reload | client/tests/lab-02/AttachmentSection.test.tsx | Pass |
| UI-16 | UI | AC-15, AC-16 | Remove attachment with reason | Shown as removed w/ reason; no download link | client/tests/lab-02/AttachmentSection.test.tsx | Pass |
| UI-17 | UI | AC-20 | Change Requester from the app shell | Context + localStorage cleared; returns to /select | client/tests/lab-02/AppShell.test.tsx | Pass |
| RESP-01 | Responsive/Visual | AC-19 | Desktop/tablet/mobile screenshots, all 3 screens | No clipping/overlap/horizontal scroll at any width | e2e/lab-02/responsive.spec.ts | Pass |
| E2E-01 | E2E | AC-01, AC-13 | Full Requester flow | Select requester → create ticket → find in My Tickets → open Detail shows same data | e2e/lab-02/requester-ticket-flow.spec.ts | Pass |
| E2E-02 | E2E | AC-03, AC-20 | Cross-Requester isolation | Requester B cannot see or open Requester A's ticket by URL | e2e/lab-02/requester-ticket-flow.spec.ts | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Covered by |
|---|---|
| AC-01 | API-01, UI-09, E2E-01 |
| AC-02 | UI-04 |
| AC-03 | API-06, API-08, E2E-02 |
| AC-04 | API-02, UI-05 |
| AC-05 | API-03, UI-06 |
| AC-06 | API-04 |
| AC-07 | API-05, UI-07 |
| AC-08 | UI-08 |
| AC-09 | UI-10 |
| AC-10 | UI-11 |
| AC-11 | API-07, UI-12 |
| AC-12 | API-07, UI-13 |
| AC-13 | API-14, UI-14, E2E-01 |
| AC-14 | API-09, UI-15 |
| AC-15 | API-10, UI-16 |
| AC-16 | API-10, UI-16 |
| AC-17 | UI-02 |
| AC-18 | UI-03 |
| AC-19 | RESP-01 |
| AC-20 | UI-17, E2E-02 |
| AC-21 | API-13 |

## 4. Responsive and Visual Checklist

See `ui-spec.md` §8 — completed during Issue 6 alongside RESP-01, with screenshots saved under
`artifacts/lab-02/screenshots/`.

## 5. Test Commands

```bash
cd server && npm test    # unit + API tests (Vitest + Supertest)
cd client && npm test    # UI tests (Vitest + Testing Library)
npx playwright test e2e/lab-02   # E2E + responsive screenshots
```

## 6. Final Results

To be filled in as each Issue's tests pass on `main` (see the **Final** column above; update
`Planned` → `Pass` per row, and paste terminal output here for the Lab 2 submission).

## 7. Known Limitations or Deferred Tests

- Attachment virus/content scanning is out of scope for Lab 2 (type/size checks only).
- Load/performance testing of pagination at large data volumes is deferred.
- Accessibility is checked manually (keyboard nav, labels) per `ui-spec.md` §7; no automated a11y
  scanner is wired in for Lab 2.
