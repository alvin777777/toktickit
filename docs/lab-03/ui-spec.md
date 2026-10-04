# Lab 3 UI Specification — Zen Green Theme

Everything in `docs/lab-02/ui-spec.md` §1–§4 (color tokens, typography/spacing, field states,
button hierarchy) and §6–§7 (responsive rules, accessibility) remains in force. This document adds
what Lab 3 needs and describes the new and changed screens.

## 1. Token and Badge Extensions

### 1.1 Role badges
| Role | Badge |
|---|---|
| Requester | `bg-secondary` (slate), text "Requester" |
| IT Staff | `--color-pale` background with `--color-primary` text, text "IT Staff" |
| Administrator | `--color-primary` background, white text, text "Administrator" |

### 1.2 Status badges (same map everywhere: My Tickets, Requester Detail, Queue, IT Staff Detail)
| Status | Badge |
|---|---|
| NEW | `bg-info text-dark` |
| OPEN | `bg-primary` (blue) |
| IN_PROGRESS | `--color-secondary` green, white text |
| WAITING_FOR_REQUESTER | `--color-warning` amber, white text |
| RESOLVED | `bg-success` |
| CLOSED | `bg-dark` |
| REOPENED | `bg-warning text-dark` |
| CANCELLED | `bg-secondary` |

Status labels are humanized (`IN_PROGRESS` → "In Progress", `WAITING_FOR_REQUESTER` → "Waiting for
Requester"). Badges always carry the text — never color alone.

### 1.3 Priority badges
Requested Priority and IT Priority use the identical Lab 2 map (LOW `bg-secondary`, MEDIUM
`bg-warning text-dark`, HIGH `bg-danger`). Where both appear side by side (queue, IT Staff detail)
each is labelled ("Req." / "IT") so they cannot be confused.

### 1.4 Private surfaces
Internal Notes use a warm amber tint (`#FFF7E6` background, `--color-warning` left border, a lock
icon + "Internal — not visible to the requester" caption) so private content is visually different
from Public Comments (white surface, `--color-pale` author chip).

### 1.5 Feedback surfaces (all screens)
| Condition | Presentation |
|---|---|
| Loading | Skeleton rows/cards or "Loading…" `role="status"` |
| Saving / submitting | Primary button shows spinner + "Saving…"/"Signing in…", form disabled |
| Success | Pale-green inline alert or updated field value with a transient "Saved" note |
| Validation | `is-invalid` field + message directly below (`--color-error`) |
| Empty | Centered muted message + the primary next action |
| No results | Filter row stays, body shows "No … match your filters." + Clear Filters |
| Forbidden (403) | Full-screen card "You don't have access to this page" + link to the role's home |
| Not found (404) | "Ticket not found" / "User not found" + back link |
| Conflict (409) | Red inline alert with the server's message (e.g. "Assign a ticket owner before resolving.") |
| API failure (5xx / network) | Red banner "Unable to … right now. Please try again." + Retry; entered values kept |

## 2. Application Shell (all authenticated screens)

- Header (`--color-primary`): TokTickIT identity left; role-specific nav center; right side shows the
  user's name, role badge (§1.1), a "Change Password" link, and a "Logout" button (secondary,
  outline-light). Mobile (<768px): nav + user block collapse into the hamburger menu.
- Navigation by role:
  - Requester: **My Tickets**, **Create Ticket**
  - IT Staff: **Ticket Queue**
  - Administrator: **Ticket Queue**, **Users**
  Unauthorized destinations are never rendered; typing their URL shows the Forbidden card (§1.5).
- Role home (after login / on `/`): Requester → `/tickets`; IT Staff → `/staff/queue`;
  Administrator → `/admin/users`.
- The Lab 2 "Change Requester" action and requester selector are removed.

## 3. Login (`/login`)

- Centered card (max-width 420px) on `--color-bg`; app identity + "Sign in to your account".
- Fields: **Email address** (type email, autocomplete `username`), **Password** (type password,
  autocomplete `current-password`, show/hide toggle with `aria-label`). Both required.
- Primary button **Sign In** (busy → "Signing in…", disabled). No "Forgot password" link (excluded).
- States:
  - **Initial:** empty fields, focus in Email.
  - **Validation:** empty email/password → field messages, no request.
  - **Invalid credentials (401):** red banner "Invalid email or password. Please try again."; password
    field cleared, email kept.
  - **Inactive (403 ACCOUNT_INACTIVE):** amber banner "This account is inactive. Contact an
    administrator."
  - **API failure:** red banner "Unable to sign in right now. Please try again." + fields kept.
  - **Success:** navigate to Change Password if `mustChangePassword`, else to the role home.
- An already-authenticated user opening `/login` is redirected to their role home.

## 4. Change Password (`/change-password`)

- Same card layout; heading "Change Your Password"; subtext when forced: "You must change your
  password to continue." (otherwise "Choose a new password.").
- Fields: **Current password**, **New password**, **Confirm new password** (all password type with
  show/hide toggles). Live rule checklist below New password: "At least 8 characters", "Upper and
  lower case letters", "At least one number" — each line gets a check mark when satisfied.
- Buttons: **Continue** (primary; busy "Saving…"). When *not* forced, a secondary **Cancel** returns
  to the role home. When forced, there is no Cancel and the shell nav is hidden except Logout.
- States: field validation (BR-05/BR-07 messages from the API or client), API failure banner,
  success → navigate to the role home with a one-time "Password updated" toast/alert.
- While `mustChangePassword` is true, every other route redirects here (AC-02).

## 5. Requester screens (regression + additions)

- **Create Ticket, My Tickets:** unchanged from Lab 2 `ui-spec.md` §5.3–§5.4, except: no selector;
  the My Tickets status filter lists all eight statuses with humanized labels; status badges use
  §1.2.
- **Requester Ticket Detail** (`/tickets/:ticketNumber`):
  - Header grid adds two read-only fields: **Ticket Owner** (owner name or "Unassigned") and
    **IT Priority** (badge). Current Status uses §1.2.
  - A **"Problem Appears Resolved"** secondary button in the header area, visible only when the Ticket
    is not RESOLVED/CLOSED/CANCELLED and not yet indicated; after success it is replaced by a
    pale-green chip "You indicated this problem appears resolved on <date>". Confirm dialog before
    the call ("Let IT Staff know this problem appears resolved? They will still verify and close it.").
  - Below Attachments, a **Public Comments** section: list (author name + role chip + date, body in
    `pre-wrap`), textarea "Add a public comment" (counter 0/2000), **Post Comment** primary button;
    disabled with the note "Comments are closed for this ticket." on CLOSED/CANCELLED Tickets.
    Internal Notes are never rendered here (there is no data to render — the API never sends them).

## 6. IT Staff Ticket Queue (`/staff/queue`)

- Page header: "Ticket Queue" + count chips: **All N · Unassigned N · Mine N** (clicking a chip sets
  the owner filter to all/unassigned/me).
- Filter row (wraps to 2 per row below `lg`): search input ("Search by ticket number, summary, or
  requester…"), **Status** select (All + eight statuses), **IT Priority** select, **Owner** select
  (All / Unassigned / Mine / each active assignee), **Category** select, **Clear** secondary button.
- Desktop (≥992px) table columns, in order: Ticket No. · Created · Summary · Requester · Category ·
  Req. Priority · IT Priority · Status · Owner. Sortable (caret) on Ticket No., Created, IT Priority,
  Status. Summary is truncated to one line with full text on hover/title. A Requester-resolved
  indication shows a small ✓ "Requester says resolved" chip after the status badge. Row click opens
  IT Staff Ticket Detail.
- Tablet/Mobile (<992px): one card per Ticket — Ticket No. + status badge on the first line; Summary;
  Requester · Category; priority badges (labelled Req./IT); Owner or "Unassigned"; Created date.
  Whole card is the tap target.
- Pagination footer identical to My Tickets ("Showing X to Y of Z tickets", Previous / Next).
- States (§1.5): loading skeletons; **empty** (no Tickets exist at all) "No tickets yet."; **no
  results** with Clear Filters; **forbidden** card for Requesters; failure banner + Retry with filters
  preserved.

## 7. IT Staff Ticket Detail (`/staff/tickets/:ticketNumber`)

- Breadcrumb "Ticket Queue › Ticket Detail" + **Back to Queue** secondary button (top right).
- **Ticket information card** (read-only, ivory fields, 3 columns desktop / 2 tablet / 1 mobile):
  Ticket No. · Category · Related System · Requester (name, email as help text) · Requested Priority
  (badge) · Created · Summary (full width) · Description (full width, pre-wrap).
- **Operations card** (editable, white fields), 3 columns:
  - **Ticket Owner**: shows owner name or "Unassigned". Actions: **Claim** (primary, only when
    unassigned), **Reassign** (secondary; opens a select of active assignees + Unassign option +
    Save/Cancel). 409 ALREADY_ASSIGNED from Claim shows the message and switches the control to
    Reassign.
  - **IT Priority**: select LOW/MEDIUM/HIGH, saves on change with a "Saved" note; Requested Priority
    badge shown beside it for comparison.
  - **Status**: current badge + select listing *only* `allowedTransitions` from the API + **Update
    Status** button. Choosing CLOSED or CANCELLED opens a confirm dialog ("Close this ticket? This
    can only be undone by reopening." / "Cancel this ticket? This cannot be undone."). 409
    OWNER_REQUIRED / INVALID_TRANSITION show as a red inline alert under the select.
  - A Requester-resolved banner ("The requester indicated this problem appears resolved on <date>")
    appears above the operations card when set.
  - On CLOSED/CANCELLED Tickets, Owner and IT Priority controls are read-only and Status offers only
    REOPENED (for CLOSED) or nothing (CANCELLED).
- **Tabs** below: **Public Comments (n)** · **Internal Notes (n)** · **Attachments (n)**.
  - Public Comments: list + composer as in §5, posted as the IT Staff user (role chip "IT Staff").
  - Internal Notes: amber private surface (§1.4), list + composer labelled "Add internal note (not
    visible to the requester)". Always enabled.
  - Attachments: Lab 2 list (active + removed metadata) with Download only — no Add/Remove for IT
    Staff in Lab 3.
- States: loading; not found; forbidden; per-action busy states (button spinner) and failure
  alerts that keep the current values.

## 8. Administrator User Management (`/admin/users`)

- Page header "Users" + **Create User** primary button (top right).
- Filter row: search input ("Search users by name or email…") + **Role** select (All roles /
  Requester / IT Staff / Administrator). One filter at a time plus search is sufficient (no
  multi-filter, no pagination — handout §8.5).
- Desktop table: Name · Email · Role (badge §1.1) · Status (Active `bg-success` / Inactive
  `bg-secondary` outline) · **Edit** (tertiary link). Rows flagged "Password change pending" show a
  small muted key icon + text after the status. Below `lg`: cards with the same fields and an Edit
  button.
- **Side panel / modal** (right drawer ≥992px, full-screen sheet below) in two modes:
  - **Create New User**: Full Name*, Email Address*, Role* (select), Active (toggle, default Yes),
    Initial Password* (password field with show/hide + rule checklist). Buttons **Save User**
    (primary) / **Cancel**.
  - **Edit User**: Full Name*, Email Address*, Role*, Active toggle; **Save Changes** / **Cancel**;
    a separate boxed section **Set Initial Password** with a password field + **Set Password**
    secondary button (own confirm dialog: "The user will be signed out and must change this
    password at next login."). The Active toggle is disabled with help text "You cannot deactivate
    your own account." for the current Administrator, and "At least one active Administrator is
    required." when this is the last active Administrator.
- Feedback: validation messages per field (name, email, role, initialPassword); 409 EMAIL_TAKEN
  appears on the Email field; 409 SELF_DEACTIVATION / LAST_ADMIN appear as a red inline alert in the
  panel; success closes the panel, updates the list in place, and shows a pale-green "User saved"
  alert; API failure keeps the panel open with values and shows the failure banner.
- Forbidden card for non-Administrators; failure banner + Retry on list load errors.

## 9. Screen Modes Summary

| Screen | Modes | Key feedback |
|---|---|---|
| Login | initial, submitting, invalid, inactive, failure | banner + field messages |
| Change Password | forced / voluntary, submitting, validation, failure, success | rule checklist |
| Ticket Queue | loading, list, empty, no-results, forbidden, failure | chips, badges |
| IT Staff Ticket Detail | loading, view, editing owner, saving priority/status, not-found, forbidden, failure | inline 409 alerts, confirm dialogs |
| Requester Ticket Detail | Lab 2 modes + comments, appears-resolved | comment counter, chip |
| User Management | loading, list, no-results, create, edit, saving, forbidden, failure | field + inline alerts |

## 10. Responsive Rules (additions)

| Viewport | Queue | IT Staff Detail | Users |
|---|---|---|---|
| Desktop ≥992px | table, filter row in one line (6 controls) | 3-column cards, tabs horizontal | table + right drawer (420px) |
| Tablet 768–991px | cards, filters 2 per row | 2 columns | cards, drawer becomes full-width sheet |
| Mobile <768px | cards, filters stacked | 1 column, tabs scrollable pills | cards, full-screen sheet, full-width buttons |

No horizontal page scrolling anywhere (automated check in `e2e/lab-03/responsive.spec.ts`).

## 11. Accessibility (additions)

- Password show/hide toggles have `aria-label="Show password"` / `"Hide password"` and `aria-pressed`.
- Role and status badges include their text; the Requester-resolved chip has `title` + text.
- Confirm dialogs trap focus, close on Escape, and return focus to the triggering button.
- Tabs on IT Staff Ticket Detail are keyboard-operable (`role="tablist"`, arrow keys via Bootstrap).
- Every table row that acts as a link is also reachable via a visible "Open" link for keyboard users.

## 12. Visual Inspection Checklist (completed in Issue 6)

To be filled with evidence from `artifacts/lab-03/screenshots/`:
- [ ] Zen Green tokens consistent across Login, Change Password, Queue, IT Staff Detail, Users
- [ ] Role-specific navigation correct for all three roles (no unauthorized destination rendered)
- [ ] Status / priority / role badges use the single shared maps (§1.1–§1.3) on every screen
- [ ] Editable vs read-only fields distinguishable at a glance (ivory vs white)
- [ ] Validation messages directly under their fields, none overlapping
- [ ] Visible focus ring on every interactive element
- [ ] No clipped labels, no truncated buttons, no overlap at any breakpoint
- [ ] No horizontal page overflow at desktop / tablet / mobile (automated)
- [ ] Internal Notes visibly distinct from Public Comments
- [ ] Screenshots captured: `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/{desktop,tablet,mobile}.png`
