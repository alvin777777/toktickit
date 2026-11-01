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
| [#61](https://github.com/alvin777777/toktickit/pull/61) | feature/18-actions-taken-foundation | [#55](https://github.com/alvin777777/toktickit/issues/55) | Migration + rollback, ActionTaken model, seed, Actions Taken APIs | Changes requested (1 × P2) → fixed in `b87bc40` → re-review requested |
| [#62](https://github.com/alvin777777/toktickit/pull/62) | feature/19-ticket-workflow | [#56](https://github.com/alvin777777/toktickit/issues/56) | Resolution gate, status history, stale-update checks, flake fixes | **Approved**, merged |
| [#63](https://github.com/alvin777777/toktickit/pull/63) | feature/20-actions-taken-ui | [#57](https://github.com/alvin777777/toktickit/issues/57) | Actions Taken UI (list, create, edit, requester view) | **Approved**, merged |
| [#64](https://github.com/alvin777777/toktickit/pull/64) | feature/21-role-dashboards | [#58](https://github.com/alvin777777/toktickit/issues/58) | Requester + IT Staff / Admin dashboards, drill-down | **Approved**, merged |
| [#65](https://github.com/alvin777777/toktickit/pull/65) | feature/22-final-hardening | [#59](https://github.com/alvin777777/toktickit/issues/59) | E2E, regression, screenshots, session probe, final docs | **Approved** (1 doc note), merged |
| _integration PR_ | integration/lab4-stack → lab4-staging | — | Reviewed stack #61–#65 + the #61 fix + this record | see note below |
| _release PR_ | lab4-staging → main | — | Lab 4 release | after the integration PR |

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
passed / 14 desktop-only skips. Partner's re-review: _pending_.

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

<!-- Fill in: PR link, scope, my summary comment, inline findings with priority, the partner's
     response, and my final verdict. -->

| PR | Scope | My verdict |
|----|-------|------------|
| _to be added_ | | |
