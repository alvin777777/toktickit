# Lab 2 — Peer Review Record

**Author:** ไอโว ปีเตอร์ อัลวิน รันเน่ — 67070501051 — GitHub: @alvin777777
**Peer reviewer:** ทิฐินันท์ สอบกิ่ง — 67070501018 — GitHub: @Ohmmykung09

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| [#23](https://github.com/alvin777777/toktickit/pull/23) | feature/5-lab2-spec | Changes requested (4 cross-file contract gaps) → all fixed, merged |
| | feature/6-dev-requester-context | |
| | feature/7-create-ticket | |
| | feature/8-my-tickets | |
| | feature/9-ticket-detail-attachments | |
| | feature/10-responsive-qa-release | |

(Fill in each row's comment/response as PRs are reviewed — same format as docs/lab-01/reviewer.md.)

### PR #23 — reviewer comment I received
> Thanks for putting the Lab 2 contract together. I am requesting changes because a few cross-file
> contract gaps would make the later implementation PRs ambiguous: requester-context failures
> currently have conflicting status codes, the My Tickets API response is missing data required by
> the UI, and two important behaviors are either incorrectly mapped or not covered by the planned
> tests.

Specifically (inline comments): BR-09 said 400 while api-spec.md said 401 for the same
missing/inactive `X-Requester-Id` case; the My Tickets list response was missing `updatedAt` needed
for the "Last Updated" UI field; the partial-attachment-failure business rule (BR-15) had no
Acceptance Criterion or planned test; and AC-13 was traced to API-08, which actually tests the
non-owner 404 case, not the owned-ticket-detail happy path.

### How I responded
> Thanks for the thorough review — all 4 fixed: BR-09 now says 401 everywhere; GET /api/tickets list
> items now include `updatedAt`; added AC-21 + test API-13 for the partial-attachment-failure rule;
> added API-14 (the actual happy path) and remapped AC-13 to it. Re-requesting review.

Outcome: fixed and merged.

## Pull Requests I reviewed for my partner
My comment: <...>
Partner's response: <...>
