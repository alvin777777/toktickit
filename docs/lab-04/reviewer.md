# Lab 4 — Peer Review Record

**Author:** ไอโว ปีเตอร์ อัลวิน รันเน่ — 67070501051 — GitHub: @alvin777777
**Peer reviewer:** ทิฐินันท์ สอบกิ่ง — 67070501018 — GitHub: @Ohmmykung09

## Pull Requests I authored (reviewed by my partner)

As in Lab 3 the PRs are **stacked**: each PR's base is the previous feature branch, so the reviewer
sees only that Issue's diff. Merge order: #60 → #61 → #62 → #63 → #64 → #65, each into
`lab4-staging`, **deleting the merged branch each time** so GitHub retargets the next PR to
`lab4-staging` (the Lab 3 integration note explains what happens otherwise). Then one release PR
`lab4-staging → main`.

| PR | Branch | Issue | Scope | Reviewer verdict |
|----|--------|-------|-------|------------------|
| [#60](https://github.com/alvin777777/toktickit/pull/60) | feature/17-lab4-spec | [#54](https://github.com/alvin777777/toktickit/issues/54) | Sprint 4 engineering contract (spec, API, UI, tests) | **Approved**, merged into `lab4-staging` |
| [#61](https://github.com/alvin777777/toktickit/pull/61) | feature/18-actions-taken-foundation | [#55](https://github.com/alvin777777/toktickit/issues/55) | Migration + rollback, ActionTaken model, seed, Actions Taken APIs | Changes requested (1 × P2) → fixed in `b87bc40` → **approved** on re-review, merged |
| [#62](https://github.com/alvin777777/toktickit/pull/62) | feature/19-ticket-workflow | [#56](https://github.com/alvin777777/toktickit/issues/56) | Resolution gate, status history, stale-update checks, flake fixes | **Approved**, merged |
| [#63](https://github.com/alvin777777/toktickit/pull/63) | feature/20-actions-taken-ui | [#57](https://github.com/alvin777777/toktickit/issues/57) | Actions Taken UI (list, create, edit, requester view) | **Approved**, merged |
| [#64](https://github.com/alvin777777/toktickit/pull/64) | feature/21-role-dashboards | [#58](https://github.com/alvin777777/toktickit/issues/58) | Requester + IT Staff / Admin dashboards, drill-down | **Approved**, merged |
| [#65](https://github.com/alvin777777/toktickit/pull/65) | feature/22-final-hardening | [#59](https://github.com/alvin777777/toktickit/issues/59) | E2E, regression, screenshots, session probe, final docs | **Approved** (1 doc note), merged |
| [#66](https://github.com/alvin777777/toktickit/pull/66) | integration/lab4-stack → lab4-staging | — | Reviewed stack #61–#65 + the #61 fix + this record | **Approved**, merged (`dd78f54`) |
| _release PR_ | lab4-staging → main | — | Lab 4 release | see the release PR link in the submission |

**Integration note.** All six PRs were approved or reviewed within a few minutes on 2026-10-31 and
merged bottom-up into their *stacked bases* without deleting them, so GitHub did not retarget them
(the same thing as in Lab 3): #60 reached `lab4-staging`, while #62 → `feature/18`, #63 →
`feature/19`, #64 → `feature/20`, #65 → `feature/21`. Nothing was lost — `feature/21-role-dashboards`
holds every Issue 2–6 commit — but `lab4-staging` held only the spec. #61 stayed open with changes
requested. The fix was committed on #61's own branch (`b87bc40`), and `integration/lab4-stack` =
`feature/21` + that fix + this record is brought into `lab4-staging` in one PR. Its diff contains
only reviewed commits plus the fix and doc updates listed here.

### PR #60 — reviewer comment I received
> Reviewed the Lab 4 engineering contract against the requested focus areas. The resolution gate
> is explicit and backend-enforced, Completed/Cancelled actions are immutable, and the dashboard
> metric queries are defined to match their drill-down lists. I found no blocking contract
> ambiguity in this PR. Approved.

### PR #61 — reviewer comment I received
> Please check the request ID against the ticket in the P2002 recovery path too.

Inline finding (`server/src/routes/actions.ts:127`): **[P2]** The non-racing replay path checks
`ticketId`, but this unique-index race path does not. If two requests with the same
`clientRequestId` arrive concurrently for different tickets, the loser will return 200 with the
winner's action from the other ticket instead of `DUPLICATE_REQUEST`. Please check
`existing.ticketId` against `ticket.id` here before returning it.

### How I responded
> Fixed in `b87bc40` — good catch. The replay check and the P2002 recovery now share one helper
> that returns 409 `DUPLICATE_REQUEST` unless the existing action belongs to this ticket. New test
> API-09b posts the same clientRequestId to two tickets concurrently for six rounds: before the fix
> it failed on every run with `[200, 201]` (the loser got the other ticket's action); now 201 + 409
> every round, 5/5 runs.

The finding was a real data-exposure bug that API-09 missed, because API-09 only raced on *one*
Ticket. Full suites after the fix on the integrated branch: server 205/205, client 106/106, E2E 64
passed / 14 desktop-only skips.

Partner's re-review (approved):
> Re-reviewed the P2 fix on b87bc40. The replay helper is now used both before create and after
> P2002, and returns 409 DUPLICATE_REQUEST when the existing action belongs to a different ticket;
> same-ticket retries still return the original action. API-09b exercises concurrent cross-ticket
> reuse and asserts one 201, one 409, and a single stored row. The prior finding is resolved.
> Approved.

### PR #66 — reviewer comment I received
> Reviewed this as the staging integration PR. Its diff is the previously reviewed Lab 4 stack
> (#61–#65) plus the #61 P2 fix and the expected reviewer/test-record updates; the #60 contract is
> already in lab4-staging. The integration branch is CLEAN/MERGEABLE against lab4-staging, and the
> documented full-stack evidence is server 205, client 106, E2E 64 passed / 14 skipped. I found no
> additional integration issue. Approved.

After the merge, `lab4-staging` was checked out and verified identical to the reviewed
`integration/lab4-stack` tree; server 205/205 and client 106/106 re-ran green on it.

### PR #62 — reviewer comment I received
> Reviewed the locked workflow, resolution gate, history serialization, and Lab 3 regression
> changes. Ticket workflow writes and Action writes serialize on the same Ticket row, so the gate
> sees committed action state; status history and resolvedAt handling follow the contract. The two
> test-infrastructure fixes are narrowly scoped. I found no blocking issue in this PR. Approved.

### PR #63 — reviewer comment I received
> Reviewed create/edit/retry handling, the stale-update draft flow, the ConfirmBox button type
> fix, and the Requester read-only rendering. The form keeps the idempotency key for retries,
> refreshes Ticket gate state after saves, and does not expose write controls to Requesters or for
> final actions. I found no blocking UI issue in this PR. Approved.

### PR #64 — reviewer comment I received
> Reviewed the requested invariant that dashboard counts match their drill-down query totals. The
> API response queries correspond to the metric definitions, the list filters implement the same
> predicates (including active-only and appears-resolved), and the dashboard reads use one
> REPEATABLE READ snapshot. Requester scope and admin-only user counts are enforced at the API
> route. The action-count card links to its dashboard list anchor. I found no blocking issue.
> Approved.

### PR #65 — reviewer comment I received
> Reviewed the E2E flows, session probe, regression updates, and final evidence/docs. The
> resolution flow covers the blocked gate and successful follow-up path; the dashboard E2E checks
> compare card values to filtered list totals; the session probe preserves /me semantics. No
> blocking issue found. One small documentation mismatch: tests.md says Final becomes Pass once
> run on the release branch, while §6 records this run on feature/22-final-hardening and says main
> will be rerun after release; please align that sentence when updating the review record.
> Approved.

### How I responded
> Aligned in the integration branch: `tests.md` §1 and §6 now both name `integration/lab4-stack`
> (the reviewed stack plus the #61 fix, i.e. exactly what `lab4-staging` and `main` receive) as the
> branch the Final results were recorded on, with the re-run numbers (server 205, client 106, E2E
> 64 passed / 14 skipped).

## Pull Requests I reviewed (my partner's Lab 4 PRs)

Repository: [Ohmmykung09/toktickit](https://github.com/Ohmmykung09/toktickit). Each review was done
by reading the diff against `lab4-staging` (not by running the suites), first as a *Comment* review
with inline findings, then re-checked against the fix commit before approving. My partner's
second reviewer, @MacOverlorD, reviewed the same PRs; I avoided repeating findings already in
that review.

| PR | Scope | My review | Fix commit I re-checked | My verdict |
|----|-------|-----------|-------------------------|------------|
| [#60](https://github.com/Ohmmykung09/toktickit/pull/60) | Lab 4 Issues #51–#53 (Actions Taken, workflow, dashboards) | [Commented](https://github.com/Ohmmykung09/toktickit/pull/60#pullrequestreview-5367470974) 2026-09-30 — 10 inline + 5 summary findings | `4c1f53c` | [**Approved**](https://github.com/Ohmmykung09/toktickit/pull/60#pullrequestreview-5376146509) 2026-10-01 |
| [#62](https://github.com/Ohmmykung09/toktickit/pull/62) | Final regression and E2E hardening | [Commented](https://github.com/Ohmmykung09/toktickit/pull/62#pullrequestreview-5472684297) 2026-10-09 — 4 inline findings | `f8955d5` | [**Approved**](https://github.com/Ohmmykung09/toktickit/pull/62#pullrequestreview-5472980128) 2026-10-09 |
| [#63](https://github.com/Ohmmykung09/toktickit/pull/63) | Lab 4 evidence and release preparation (docs) | [Commented](https://github.com/Ohmmykung09/toktickit/pull/63#pullrequestreview-5478642060) 2026-10-10 — 4 inline + 2 summary findings | `f513efe` | [**Approved**](https://github.com/Ohmmykung09/toktickit/pull/63#pullrequestreview-5479236286) 2026-10-10 |

### PR #60 — my review
> Nice work getting #51, #52 and #53 into one PR. I read through the diff against `lab4-staging`
> (code reading only, I did not run it) and left 10 inline comments. The first four on
> `ActionsTakenPanel.tsx` are bugs users will hit, so I'd fix those before merging; the rest are
> smaller or spec gaps.

Findings: timezone shift in the Action date input; no reload after a stale write; idempotency key
not kept across retries; status select not limited to allowed transitions; success message
overwriting a load error; one empty-state text reused for every dashboard list; Follow-up Note
always visible (ui-spec says it appears when checked); `label()` duplicated in three files; the
staff-dashboard 403 test asserting only the status and no Administrator access test (#53);
inactive assignee shown as "Unassigned" in the edit select.

**Partner's response / my re-check (`4c1f53c`)** — fixed: timezone, stale-write reload, retry key,
allowed transitions + confirm (matching the server's `actionTransitions`), message precedence,
initial `actions` state, dashboard drill-downs, per-list empty text, shared `label()`,
Administrator access test. Left as agreed follow-ups: the unbounded urgent-ticket query and the
duplicated Actions Taken select. One small regression noted inline (hidden Follow-up Note kept its
value). **Approved.**

### PR #62 — my review
> Good coverage push overall. The three Lab 4 flows read clearly, the deterministic fixtures are a
> big improvement, and fixing the Lab 2 E2E to use real sign-in was overdue.

Inline findings: **(1)** planned tests (incl. AUTH-01, the only coverage of BR-28 Origin/CSRF on
the new mutation endpoints) were deleted from `tests.md` instead of delivered; **(2)** the 10k/50k
performance smoke ran in the default server suite against the dev database in parallel, where it
could break baseline-delta tests; **(3)** the E2E browser-error filters ignored every 409 / 503 for
the whole test; **(4)** the `MyTickets` `key` change was a real product fix inside a test PR — worth
describing and covering with a client test.

**My re-check (`f8955d5`)** — all four done: missing-Origin / wrong-CSRF-token tests on Action
create and Ticket status (403 `CSRF_REJECTED`, nothing persisted) with the row restored in
`tests.md`; perf smoke behind `LAB4_PERF=1` with its own `test:perf:lab4` script in the isolated
schema; expected errors matched by URL and status; a client test that `resolvedSince` is dropped
after returning to My Tickets. **Approved.**

### PR #63 — my review
> Thanks for pulling the whole Lab 4 trail together. The issue-to-PR table and the explicit "no
> final-main claim yet" wording are good.

Findings (checked against the GitHub API): **(1)** the PR #60 record in `reviewer.md` mixed up
reviewers, states, and dates, and listed three still-open items as addressed (urgent-query bound,
shared action select, clearing the follow-up note); **(2)** the release command would open the
release PR with a stale verification section, and two release bodies disagreed; **(3)** `ai-use.md`
replaced the specification-stage prompts instead of appending; **(4)** the evidence renderer
silently dropped cards with an unknown status. Also: two mobile screenshots not refreshed with
the rest, and a duplicate PR-body file that would go stale.

**Partner's response** — replied on every thread with the fix
([e.g. reviewer.md](https://github.com/Ohmmykung09/toktickit/blob/f513efef01c67db44220a02828e5c3ddd2a0b67a/docs/lab-04/reviewer.md)).
**My re-check (`f513efe`)** — #60 record corrected with both reviewers' real states and links, the
three items recorded as deferred; one placeholder-checked release template, duplicate file
removed; the six specification-stage prompt rows restored; the renderer throws on unknown status;
capture provenance documented. I also noted that `tests.md` honestly records the PR #63 gate as
**exit 1** (Playwright never started, port 3000 taken), so a clean E2E run is still owed on the
release candidate. **Approved** (docs only, no application code).
