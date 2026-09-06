# Lab 2 UI Specification — Zen Green Theme

## 1. Color Tokens

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#006B3C` | App header, primary buttons, strong emphasis |
| `--color-secondary` | `#0B7A46` | Active tabs, focus accents, links, hover states |
| `--color-pale` | `#EAF6EF` | Selected rows, success surfaces, subtle emphasis |
| `--color-bg` | `#F5F7F6` | Page background |
| `--color-surface` | `#FFFFFF` | Cards/panels, subtle border + restrained shadow |
| `--color-text` | `#1B2B24` | Body text (dark charcoal-green, not pure black) |
| `--color-editable-bg` | `#FFFFFF` | Editable field background, neutral border |
| `--color-readonly-bg` | `#F3F1EA` | Read-only field background (warm ivory) |
| `--color-error` | `#8A1F1F` | Error text/border |
| `--color-warning` | `#B7791F` | Warning callouts/badges (amber) |
| `--color-success` | `#0B7A46` | Success confirmations |

## 2. Typography and Spacing

- Base font size 16px, headings step up by 1.25x (h1 ≈ 25px, h2 ≈ 20px).
- Field label: 14px, weight 600, `margin-bottom: 4px`.
- 8px spacing scale (8/16/24/32) for padding/margins throughout.

## 3. Field States

| State | Style |
|---|---|
| Editable | White bg, 1px `#C9D3CE` border, `--color-secondary` border on focus + visible focus ring |
| Read-only | `--color-readonly-bg` bg, no border, not focusable, cursor default |
| Invalid | `--color-error` border (2px), error message directly below in `--color-error` text |
| Disabled | 50% opacity, `not-allowed` cursor, no hover/focus effects |
| Required marker | Red asterisk immediately after the label text; never the only validation signal |

## 4. Button Hierarchy

| Kind | Style |
|---|---|
| Primary | Solid `--color-primary` bg, white text (e.g. Submit, Continue, Create Ticket) |
| Secondary | White bg, `--color-primary` border+text (e.g. Cancel, Clear Filters) |
| Tertiary | Text-only, `--color-secondary` (e.g. inline links, "Add another attachment") |
| Destructive | White bg, `--color-error` border+text, confirm dialog required (e.g. Remove attachment) |
| Disabled | Gray bg/text regardless of kind, not clickable |
| Busy | Spinner + "Saving…"/"Loading…" label, disabled, used for Submit while a request is in flight |

## 5. Screens

### 5.1 Application Shell
- Header: TokTickIT identity (left) · My Tickets / Create Ticket nav (center) · current Requester
  name + "Change Requester" + generic profile icon (right).
- Active nav item: `--color-secondary` underline/background.
- Mobile (<768px): nav collapses into a hamburger menu; Requester name moves into that menu.

### 5.2 Development Requester Selection
- Centered card, max-width 480px, on `--color-bg`.
- Icon, "Select Development Requester" heading, one sentence explaining it is a Lab 2 test-only
  mechanism (not login).
- Dropdown labeled "Development Requester *", populated from `GET /api/requesters`.
- Info callout (pale green): "Only active development requesters are shown."
- Secondary callout: "Authentication coming in Lab 3."
- Cancel (secondary, disabled — nothing to cancel to yet) + Continue (primary, disabled until a
  Requester is chosen).
- **Loading:** dropdown replaced by a skeleton/placeholder row + disabled Continue.
- **Empty:** "No active development requesters were found. Contact an administrator." + disabled
  Continue, no dropdown shown.
- **Error:** pale-red callout "Unable to load development requesters. Please try again." + Retry
  button.

### 5.3 Create Ticket
Order top→bottom: system-generated placeholders (Ticket Number "Generated after submit", Ticket
Date "Today") shown read-only and grayed → Category / Related System / Requested Priority (grouped,
one row on desktop, stacked on mobile) → Summary (full width, single line) → Description (full
width, resizable textarea, min 4 rows) → Attachments (drag/drop + file picker, list of selected
files with size and a per-file remove control, inline error under any rejected file) → actions row
(Cancel secondary, Create Ticket primary).

States:
- **Initial:** all editable fields empty, no messages.
- **Validation failure:** offending field(s) get the invalid style + message; focus moves to the
  first invalid field; nothing is submitted.
- **Submitting:** Create Ticket button shows busy state, all fields disabled, no double-submit
  possible.
- **Success:** form replaced by a pale-green confirmation panel showing the generated Ticket Number,
  a "View Ticket" primary action, and a "Create Another" secondary action.
- **API failure:** red banner above the form ("Unable to create ticket right now. Your entries have
  been kept — please try again."); all field values remain exactly as entered; busy state clears.
- **Invalid attachment:** the offending file is not added to the list; an inline message names the
  file and the reason (type/size/count).

### 5.4 My Tickets
- Header row: page title + "Create Ticket" primary button (top right).
- Filter row: search input (icon-prefixed) + Category / Requested Priority / Current Status
  dropdowns + "Clear Filters" secondary button.
- Desktop (≥992px): table with sortable column headers (click toggles asc/desc, small caret icon)
  — Ticket No., Created Date, Summary, Category, Requested Priority (badge), Current Status (badge),
  Last Updated.
- Tablet/Mobile (<992px): one card per Ticket — Ticket No. + Summary as the card title, badges for
  Priority/Status, Created Date as secondary text; whole card is a tap target opening Ticket Detail.
- Pagination footer: "Showing X to Y of Z tickets" + Previous/Next + page numbers, same on all sizes.
- **Loading:** skeleton rows/cards in place of data.
- **Empty (BR-21):** illustration + "You haven't created any tickets yet." + Create Ticket button, no
  filter row shown (nothing to filter).
- **No results (BR-21):** filter row stays visible; body area shows "No tickets match your filters."
  + Clear Filters button.
- **Failure:** red banner + Retry button, filters/search preserved.

### 5.5 Requester Ticket Detail
- Breadcrumb: "My Tickets > Ticket Details" (back link to My Tickets).
- Header grid (read-only, `--color-readonly-bg` fields), same grouping as Create Ticket: Ticket No. /
  Ticket Date / Category / Related System on one row; Requester / Requested Priority / Current
  Status on the next; Summary full width; Description full width (multi-line, read-only).
- Attachments section (tab or simple section — Lab 2 needs only this one section, unlike the full
  Figure 1 mockup's Comments/Actions/Event Log tabs, which are out of scope):
  - "Add Attachment" control at the top (opens file picker, same validation as Create Ticket).
  - List of attachments: active ones show filename, size, uploaded date, Download and Remove
    actions; removed ones show the same metadata plus "Removed <date> — <reason>" in muted text, no
    Download/Remove actions, and a grayed-out/struck-through filename.
  - Removing opens a confirm dialog requiring a reason (min 3 chars) before calling the API.
- **Not found / not owned:** the whole screen is replaced by a simple "Ticket not found" message +
  link back to My Tickets (BR-22 — never reveals which case it was).

## 6. Responsive Rules

| Viewport | Behavior |
|---|---|
| Desktop ≥992px | Multi-column layout, content max-width ~1100px centered |
| Tablet 768–991px | Two-column field groups where the desktop had three+; Summary/Description full width |
| Mobile <768px | Everything stacks in one column; buttons full-width; no horizontal scroll anywhere |

## 7. Accessibility

- Every control has a visible label (icon-only controls also get `aria-label` + tooltip).
- Focus ring visible on every interactive element for keyboard navigation.
- Badges and error states never rely on color alone — text/icon always accompanies the color.
- Dropdowns and dialogs are operable with keyboard only (Tab/Enter/Escape).

## 8. Visual Inspection Checklist (fill in during Issue 6)

- [ ] No clipped labels or truncated buttons at any breakpoint
- [ ] No overlapping validation messages
- [ ] No unintended horizontal scrolling at 375px width
- [ ] Priority/Status badges use consistent colors across My Tickets and Ticket Detail
- [ ] Editable vs read-only fields are visually distinguishable at a glance
- [ ] Screenshots captured: `artifacts/lab-02/screenshots/{create-ticket,my-tickets,ticket-detail}/`
      at desktop, tablet, and mobile widths
