# Lab 4 UI Specification — Zen Green Theme

Everything in `docs/lab-02/ui-spec.md` (tokens, typography, field states, button hierarchy,
responsive and accessibility rules) and `docs/lab-03/ui-spec.md` (role / status / priority badges,
private surfaces, feedback surfaces, shell, Queue, Ticket Detail, Users) remains in force. This
document adds what Lab 4 needs. Business rules (BR-nn) refer to `docs/lab-04/specification.md`.

## 1. Token and Component Extensions

### 1.1 Action status badges
| Action status | Badge | Text |
|---|---|---|
| PLANNED | `bg-light text-dark border` | "Planned" |
| IN_PROGRESS | `--color-secondary` (#0B7A46) green, white text | "In Progress" |
| COMPLETED | `bg-success` | "Completed" |
| CANCELLED | `bg-secondary` | "Cancelled" |

A **Follow-up** badge (`--color-warning` #B7791F amber, white text, text "Follow-up needed") marks an
action with Follow-Up Required. Badges always carry their text — never colour alone.

### 1.2 Metric card
White card, 1 px `#DDE5E0` border, `--radius` 0.5 rem, padding 1 rem. Content top-to-bottom:
label (small, `--color-text-muted`), value (`fs-2`, `fw-semibold`, `--color-text`), drill-down link
"View" + `→` (`--color-primary`, underlined on hover/focus). The whole card is **one** link element
(`<a>`) with an accessible name "`<Label>`: `<value>`. View tickets" so keyboard and screen-reader
users get the number and the destination in one stop; focus shows the standard Bootstrap ring. A
card without a drill-down list (e.g. My Open Actions) links to the in-page list (`#my-open-actions`).
A value of 0 is shown as "0" with the same styling (BR-31).

### 1.3 Dashboard list panel
White card with a header row (title left, "View all" link right when a list screen exists). Rows:
Ticket Number (`--color-primary`, link to Ticket Detail) + Summary (truncated with ellipsis on one
line, full text in `title`), status badge, and a muted date (local time). Empty → one muted line
(e.g. "Nothing needs your attention right now."). Max 5 rows (BR-27).

### 1.4 Read-only vs editable
Read-only fields keep the ivory `#F3F1EA` surface; editable fields are white. Final (Completed /
Cancelled) actions never render inputs — only text — so there is nothing that looks editable but is
not.

### 1.5 Feedback (additions to L3 ui-spec §1.5)
| Condition | Presentation |
|---|---|
| Stale update (409 `STALE_UPDATE`) | Amber alert "Someone else changed this … while you were editing. The latest values are shown below." + "Use latest" (reload) button; the user's draft stays in the form until they choose |
| Resolution blocked | "To resolve this ticket" checklist under the Status control (✓/✗ + text for owner, completed action, no open actions, follow-up) |
| Ticket not workable | Muted line in the Actions Taken tab "Reopen the ticket to record more actions." and no Add button |
| Duplicate submit | Submit buttons disabled + "Saving…" while in flight |

## 2. Application Shell

- Navigation by role (left → right): Requester **Dashboard · My Tickets · Create Ticket**; IT Staff
  **Dashboard · Ticket Queue**; Administrator **Dashboard · Ticket Queue · Users**.
- Active link: white, bold, 2 px white bottom border (non-colour cue) and `aria-current="page"`.
- Role home (login and `/`) is `/dashboard` for every role (BR-38).
- Dashboard link sits first so Tab order matches the visual order.

## 3. Requester Dashboard (`/dashboard`, Requester)

```
┌ Welcome, <first name>!                                           [Refresh] ┐
│ Here's the latest on your requests.                                         │
├──────────────┬──────────────┬──────────────┬──────────────┐                │
│ My Open      │ Waiting for  │ Resolved     │ Closed       │  metric cards  │
│ Tickets  3   │ Me       1   │          1   │          1   │  (BR-28)       │
├──────────────┴──────────────┴──────┬───────┴──────────────┘                │
│ Needs your attention   (list)      │  Quick Actions                         │
│ Recently updated       (list)      │   + Create Ticket                      │
│ Recently resolved      (list)      │   ▤ View My Tickets                    │
└────────────────────────────────────┴────────────────────────────────────────┘
```
- Cards drill into My Tickets with the BR-28 query (e.g. `/tickets?statusGroup=active`); My Tickets
  shows the matching filter selected and a "Showing: Open tickets" chip with Clear.
- "Needs your attention" explains each row ("Waiting for your reply" / "Resolved — please check").
- States: loading (4 skeleton cards + "Loading dashboard…" `role="status"`), error (red banner +
  Retry, cards hidden), all-zero (cards show 0, lists show their empty lines, Quick Actions still
  offered).

## 4. IT Staff Dashboard (`/dashboard`, IT Staff and Administrator)

```
┌ Welcome back, <first name>!                                      [Refresh] ┐
│ Here's what's happening with the service desk today.                        │
├────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐    │
│ New    │In Prog.│Waiting │Reopened│Unassig.│My Assi.│High IT │Appears │    │
│   2    │   4    │   1    │   1    │   3    │   3    │   3    │Resolved│    │
├────────┴────────┴────────┴───┬────┴────────┴────────┴────────┴────────┘    │
│ My Open Actions (list)       │ Quick Actions: Ticket Queue · Unassigned ·   │
│ Urgent — High IT priority    │                Mine                          │
│ Recently updated (list)      │ Tickets by status    (8 labelled rows)       │
│                              │ Active by IT priority (3 labelled rows)      │
│                              │ [Admin] User accounts: R 5 · IT 3 · A 1 ·    │
│                              │         inactive 2 → Users                   │
└──────────────────────────────┴──────────────────────────────────────────────┘
```
- Cards drill into the Ticket Queue with the BR-29 query (e.g. `/staff/queue?statusGroup=active&owner=unassigned`);
  the Queue shows the filter selected plus an "Active only" / "Appears resolved" chip with Clear.
- My Open Actions card shows the "My Open Actions" count and jumps to the list; each list row opens
  Ticket Detail on the Actions Taken tab (`/staff/tickets/<n>?tab=actions`).
- Breakdown rows are text ("In Progress — 4") with a thin proportional bar as decoration only
  (`aria-hidden`); each row links to the filtered Queue.
- States: loading, error + Retry, forbidden (Requester typing a staff URL keeps the L3 forbidden
  card; `/dashboard` itself renders the role-appropriate dashboard so it is never forbidden).

## 5. Actions Taken (IT Staff Ticket Detail, first tab)

Tabs become: **Actions Taken (n)** · Public Comments · Internal Notes · Attachments (n) · History.
`?tab=actions|comments|notes|attachments|history` selects a tab from a link.

### 5.1 View mode (list)
- Desktop/tablet (≥ md): table — Date/Time · Action · Result · Performed by · Status · (Edit).
  Description and Result wrap (no truncation); Follow-up badge + note and Attachment Notes
  ("📎 <text>") render under the description.
- Mobile (< md): one card per action with the same fields stacked; Edit button full-width.
- Empty: "No actions recorded yet." + Add Action (when workable).
- Order: BR-16. The Ticket Owner is not repeated per row; "Performed by" shows the performer and,
  when different, "recorded by <name>" in muted text.

### 5.2 Create mode
"+ Add Action" (primary, top right of the tab) opens an inline form card above the list:

| Field | Control | Default | Rule |
|---|---|---|---|
| Action Date/Time | `datetime-local` | now (local) | BR-04 |
| Status | select Planned / In Progress / Completed | Completed | BR-08 |
| Action Description | textarea, counter /1000 | — | BR-05 |
| Result | textarea, counter /2000; label shows "(required to complete)" | — | BR-05 |
| Performed by | select of active IT Staff / Administrators | me | BR-03 |
| Follow-Up Required? | checkbox | off | BR-06 |
| Follow-up Note | textarea, shown + required only when the checkbox is on | — | BR-06 |
| Attachment Notes | input, counter /500, help "Which file or image to look at" | — | BR-07 |

Buttons: **Save Action** (primary; "Saving…" + disabled in flight) and Cancel (outline). The form
holds one `clientRequestId` for its lifetime so a retry after a network failure cannot duplicate
(BR-14). Validation messages sit directly under each field; server 400 fields map to the same spots.

### 5.3 Edit mode
"Edit" on an open (Planned / In Progress) row turns that row into the same form, pre-filled, plus
status buttons: **Start** (Planned → In Progress), **Complete** (requires Result; focuses Result if
empty), **Cancel Action** (danger outline, inline `ConfirmBox`). Completed/Cancelled rows have no
Edit button (BR-09). A 409 `STALE_UPDATE` shows the §1.5 amber alert inside the form.

### 5.4 Requester view
Requester Ticket Detail gets an **Actions Taken** section (below the ticket information, above
Public Comments) with the same list in view mode only — no Add / Edit controls exist in the DOM.

## 6. Ticket Workflow and Resolution Feedback

- Status select lists only `allowedTransitions` (server-computed, BR-21). Under it, when
  `resolution.canResolve` is false and the current status could move to Resolved, a
  "To resolve this ticket" checklist shows each requirement with ✓ / ✗ text.
- Every workflow request sends the Ticket `version` as `expectedVersion`. A 409 `STALE_UPDATE`
  replaces the Ticket with the server's current copy and shows "Someone else updated this ticket.
  Review the latest values and try again."
- Successful changes update the header status badge, the Operations card, the tab counts, and the
  History tab at once (the response is the full staff Ticket).
- **History** tab (staff) / **Status history** section (Requester): ordered list "From → To", actor
  name + role badge (or "System (migration)"), local date/time.

## 7. Drill-down targets

- **My Tickets** (`/tickets`) reads `statusGroup`, `currentStatus`, `requestedPriority`,
  `categoryId`, `search` from the URL on first render. `statusGroup=active` shows an "Open tickets"
  chip (Clear removes it).
- **Ticket Queue** (`/staff/queue`) reads `status`, `itPriority`, `owner`, `categoryId`, `search`,
  `statusGroup`, `appearsResolved` from the URL; the owner chips (All / Unassigned / Mine) reflect
  `owner`.

## 8. Screen Modes Summary (Lab 4)

| Screen | Modes | Key feedback |
|---|---|---|
| Requester Dashboard | loading, data, all-zero, failure | skeletons, Retry, empty lines |
| IT Staff / Admin Dashboard | loading, data, all-zero, failure | skeletons, Retry, empty lines |
| Actions Taken tab | loading, list, empty, create, edit, saving, stale, not-workable, failure | field errors, amber stale alert |
| Status control | permitted targets, blocked-resolve checklist, saving, conflict | checklist, red / amber alerts |
| History | list, empty (not possible after migration) | — |
| Requester Actions / History | read-only list, empty | — |

## 9. Responsive Rules

| Viewport | Dashboards | Actions Taken |
|---|---|---|
| Desktop ≥ 992 px | metric cards in one row (Requester 4, Staff 8 in a 4×2 grid at 992–1199, 8×1 ≥ 1200); lists 8/12 + side column 4/12 | table |
| Tablet 768–991 px | 2 cards per row; lists full width, side column below | table; form fields 2 per row |
| Mobile < 768 px | 2 cards per row (values stay legible at 390 px), lists stacked, Quick Actions full-width buttons | cards; form fields stacked; full-width buttons |

No horizontal page scrolling at any width (automated check in `e2e/lab-04/responsive.spec.ts`).
Long summaries truncate with an ellipsis inside list rows only; descriptions and results wrap.

## 10. Accessibility

- Metric cards are single links with a descriptive accessible name (§1.2); breakdown bars are
  `aria-hidden`, the count is text.
- Dashboard regions are `<section aria-labelledby>` with an `h2` each; the page has one `h1`.
- Action form: every control has a `<label for>`; errors use `invalid-feedback` linked with
  `aria-describedby`; the Follow-up Note's `required` state is announced when the checkbox turns on.
- Status, action status, and follow-up are always text badges; ✓/✗ in the checklist are paired with
  words ("Done" / "Missing").
- Cancel Action and Close / Cancel Ticket use the L3 `ConfirmBox` (focus moves in, Escape cancels,
  focus returns).
- Tabs keep `role="tablist"` / `role="tab"` / `aria-selected`; the Edit buttons carry
  `aria-label="Edit action from <date>"`.

## 11. Visual and Accessibility Checklist (completed in Issue 6)

To be completed against `artifacts/lab-04/screenshots/` (desktop 1280, tablet 820, mobile 390):

- [ ] Zen Green consistency: header, cards, buttons, badges match Lab 3 on both dashboards and Actions Taken
- [ ] Dashboard cards: label, value, drill-down visible; 0 values shown; keyboard focus ring visible
- [ ] Actions Taken list readable at every width (table ≥ md, cards < md); no clipped text
- [ ] Editable vs read-only: final actions show text only; form inputs white; ticket info ivory
- [ ] Validation messages under their fields in the action form at mobile width
- [ ] Keyboard: Tab reaches every card, list link, tab, form control, and status button in visual order
- [ ] No clipping or overlap of controls at any breakpoint (8-card grid, Operations card, action form)
- [ ] No horizontal overflow at desktop / tablet / mobile on every Lab 4 screen (automated)
- [ ] Status / priority / action-status / follow-up shown with text, not colour alone
- [ ] Old UI removed: no leftover Lab 2 selector, placeholder text, or dead links
