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
| [#60](https://github.com/alvin777777/toktickit/pull/60) | feature/17-lab4-spec | [#54](https://github.com/alvin777777/toktickit/issues/54) | Sprint 4 engineering contract (spec, API, UI, tests) | _awaiting review_ |
| [#61](https://github.com/alvin777777/toktickit/pull/61) | feature/18-actions-taken-foundation | [#55](https://github.com/alvin777777/toktickit/issues/55) | Migration + rollback, ActionTaken model, seed, Actions Taken APIs | _awaiting review_ |
| [#62](https://github.com/alvin777777/toktickit/pull/62) | feature/19-ticket-workflow | [#56](https://github.com/alvin777777/toktickit/issues/56) | Resolution gate, status history, stale-update checks, flake fixes | _awaiting review_ |
| [#63](https://github.com/alvin777777/toktickit/pull/63) | feature/20-actions-taken-ui | [#57](https://github.com/alvin777777/toktickit/issues/57) | Actions Taken UI (list, create, edit, requester view) | _awaiting review_ |
| [#64](https://github.com/alvin777777/toktickit/pull/64) | feature/21-role-dashboards | [#58](https://github.com/alvin777777/toktickit/issues/58) | Requester + IT Staff / Admin dashboards, drill-down | _awaiting review_ |
| [#65](https://github.com/alvin777777/toktickit/pull/65) | feature/22-final-hardening | [#59](https://github.com/alvin777777/toktickit/issues/59) | E2E, regression, screenshots, session probe, final docs | _awaiting review_ |
| — | lab4-staging → main | — | Lab 4 release | _after the six PRs are merged_ |

### Where a reviewer's attention is most useful
- **#60** — whether the resolution gate (BR-20) and "Completed actions are final" (BR-09) are the
  right rules, and whether the dashboard metric definitions (BR-28/BR-29) say exactly one thing.
- **#61** — the hand-edited migration and its back-fill, the rollback script, and the
  `clientRequestId` replay path under a race.
- **#62** — the row-locked workflow transaction replacing Lab 3's conditional claim; the two
  test-infrastructure fixes (IPv6 loopback for Supertest; one snapshot for queue counts).
- **#63** — keeping the draft on `STALE_UPDATE`, and the `ConfirmBox` `type="button"` change.
- **#64** — whether "dashboard = direct count = drill-down total" is really proven by API-21/24.

<!-- After the review: for each PR copy the reviewer's summary comment and inline findings
     (with priority), then "How I responded" mapping each finding to a commit/test, and the final
     verdict — same format as docs/lab-03/reviewer.md. -->

## Pull Requests I reviewed (my partner's Lab 4 PRs)

<!-- Fill in: PR link, scope, my summary comment, inline findings with priority, the partner's
     response, and my final verdict. -->

| PR | Scope | My verdict |
|----|-------|------------|
| _to be added_ | | |
