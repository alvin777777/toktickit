# Lab 2 — Peer Review Record

**Author:** ไอโว ปีเตอร์ อัลวิน รันเน่ — 67070501051 — GitHub: @alvin777777
**Peer reviewer:** ทิฐินันท์ สอบกิ่ง — 67070501018 — GitHub: @Ohmmykung09

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| [#23](https://github.com/alvin777777/toktickit/pull/23) | feature/5-lab2-spec | Changes requested (4 cross-file contract gaps) → all fixed, merged |
| [#24](https://github.com/alvin777777/toktickit/pull/24) | feature/6-dev-requester-context | Changes requested (UI-spec mismatch + missing tests) → all fixed, approved ("LGTM"), merged |
| [#25](https://github.com/alvin777777/toktickit/pull/25) | feature/7-create-ticket | Changes requested (4 edge-case bugs) → all fixed, approved ("LGTM kub"), merged |
| [#26](https://github.com/alvin777777/toktickit/pull/26) | feature/8-my-tickets | Changes requested (3 edge-case bugs) → all fixed, approved ("LGTM"), merged |
| [#27](https://github.com/alvin777777/toktickit/pull/27) | feature/9-ticket-detail-attachments | Changes requested (3 missing contract fields) → all fixed, approved ("LGTM"), merged |
| [#28](https://github.com/alvin777777/toktickit/pull/28) | feature/10-responsive-qa-release | Changes requested (2 breakpoint bugs + unreproducible test command) → all fixed (+1 extra bug found on my own re-check), approved ("LGTM"), merged |

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

### PR #24 — reviewer comment I received
> Requesting changes for two reasons: the requester-selection loading/empty UI does not fully
> match the approved UI contract, and the implemented requester context transitions are missing
> the tests required by the issue/test plan.

Specifically (inline comments): the loading state rendered only a status line instead of keeping
the form shape (skeleton row + disabled Continue) per ui-spec.md §5.2; there was no test for
selecting a requester and clicking Continue (FR-02); and no test for the Change Requester action
(UI-17 in tests.md).

### How I responded
> Thanks — both fixed: loading state now keeps the form shape with a skeleton row + disabled
> Continue; added the Continue-flow test and a new AppShell.test.tsx for Change Requester. Also
> fixed a real test-infra bug found along the way (Node's own global localStorage shadowing
> jsdom's under Vitest). All 10 client + 3 server tests pass. Re-requesting review.

Partner's response: "LGTM"

Outcome: fixed and merged.

### PR #25 — reviewer comment I received
> Requesting changes because a few create-ticket edge cases still violate the approved contract:
> malformed requester headers can become 500s, server-side attachment count failures are handled
> by Multer before the API can return the expected validation response, the client can exceed the
> 5-file limit when multiple files are selected at once, and partial attachment failures are not
> shown to the requester.

Specifically (inline comments): `Number("1.5")`/`Number("Infinity")` passed the old `isNaN` check
and reached Prisma, throwing 500 instead of the required 401; `upload.array("attachments", 5)`
let Multer reject a 6th file before our handler ran, bypassing the documented 400 response;
`handleFilePick` read the same stale `attachments.length` on every loop iteration, so one
multi-select could exceed the 5-file client cap; and the success panel silently dropped the
`attachmentErrors` the API already returned for BR-15.

### How I responded
> Thanks — all 4 fixed: `requireRequester` now validates the header as a positive integer within
> Postgres's int range before querying; Multer's own limits are now just a generous safety net
> while we enforce the real 5-file cap ourselves with the same 400 shape; the file picker
> accumulates locally and commits once instead of reading stale state per iteration; and the
> success panel now lists which attachment(s) failed and why. 18 server + 17 client tests pass.
> Re-requesting review.

Partner's response: "LGTM kub"

Outcome: fixed and merged.

### PR #26 — reviewer comment I received
> Requesting changes because a few My Tickets edge cases can show incorrect data: invalid
> pagination query strings are partially accepted instead of falling back to defaults, overlapping
> search/filter requests can overwrite the newest results with stale ones, and the pagination range
> text is calculated incorrectly on partial pages.

Specifically (inline comments): `parseInt("2abc")` parsed as `2` instead of falling back to the
default (BR-13); slower, older search/filter requests could resolve after and overwrite newer
ones, showing stale results while typing; and the "Showing X to Y of Z" text used `items.length`
and a hard-coded `10` instead of the real `pageSize`, giving the wrong range on partial pages.

### How I responded
> Thanks — all 3 fixed: replaced `parseInt` with a strict `Number()` + `Number.isInteger` check;
> added a request-id ref so a stale response can never overwrite a newer one's results; fixed the
> range math to use the real `pageSize` from the API. 23 server + 23 client tests pass.
> Re-requesting review.

Partner's response: "LGTM"

Outcome: fixed and merged.

### PR #27 — reviewer comment I received
> Requesting changes because the Ticket Detail/Attachment implementation still misses required
> contract fields: the detail header omits several read-only fields from the UI spec, attachment
> metadata responses omit ticketId from the API contract, and the attachment list does not show
> uploaded dates as required.

Specifically (inline comments): the header was missing Requester, Category, and Related System
(ui-spec.md §5.5 requires them alongside Ticket No./Date/Priority/Status); `serializeAttachment`
omitted `ticketId`, which api-spec.md §8 documents as part of the metadata shape; and the
attachment list never showed `uploadedAt` for either active or removed items.

### How I responded
> Thanks — all 3 fixed: added Requester/Category/Related System to the header; added `ticketId` to
> the attachment serializer and type; added the uploaded date display for both active and removed
> attachments. 34 server + 30 client tests pass. Re-requesting review.

Partner's response: "LGTM"

Outcome: fixed and merged.

### PR #28 — reviewer comment I received
> Requesting changes because the responsive QA does not yet catch the tablet layouts required by
> the UI spec, and the documented E2E evidence is not reproducible with the command in tests.md.

Specifically (inline comments): the My Tickets table/card breakpoint was `md` (768px) instead of
`lg` (992px), so tablet showed the dense desktop table instead of cards per ui-spec.md §5.4; Create
Ticket/Ticket Detail's field rows used `col-md-4`, giving 3 columns at 768px instead of the 2
required on tablet (§6); and `tests.md`'s documented test command (`npx playwright test
e2e/lab-02` from repo root) didn't match where the `e2e/` package/config actually live, so the
evidence wasn't reproducible as written.

### How I responded
> Thanks — both fixed, plus one more I found while re-verifying: My Tickets breakpoint moved to
> `lg`; Create Ticket/Ticket Detail field rows changed to `col-md-6 col-lg-4`; and while re-checking
> screenshots after those fixes, found the My Tickets filter row itself clipping labels at tablet
> width, restructured to 2-per-row. Also replaced the screenshot-only checks with real per-viewport
> assertions and fixed the tests.md command. 34 server + 30 client + 15 E2E tests pass (run twice
> for stability). Re-requesting review.

Partner's response: "LGTM"

Outcome: fixed and merged.

## Pull Requests I reviewed for my partner

Partner's repo: https://github.com/Ohmmykung09/toktickit

| PR | Branch/Scope | Outcome |
|----|--------|------------------|
| [#17](https://github.com/Ohmmykung09/toktickit/pull/17) | Lab 2: Prepare specification, API contract, UI specification, and test plan | Changes requested (idempotency gap) → fixed, approved ("Lgtm"), merged |
| [#18](https://github.com/Ohmmykung09/toktickit/pull/18) | Lab 2: Add requester ticket data model, migrations, and seed data | Comment (stricter test assertion) → fixed, approved, merged |
| [#19](https://github.com/Ohmmykung09/toktickit/pull/19) | Lab 2: Add Development Requester selection | Comment (apparent duplicate logic) → clarified, approved, merged |
| [#20](https://github.com/Ohmmykung09/toktickit/pull/20) | Lab 2: Add Create Ticket workflow | Comment (diff review gap) → clarified, approved, merged |
| [#21](https://github.com/Ohmmykung09/toktickit/pull/21) | Lab 2: Add My Tickets and Ticket Detail | Comment (enum/dropdown case-mismatch bug) → fixed, approved, merged |
| [#22](https://github.com/Ohmmykung09/toktickit/pull/22) | Lab 2: Add ticket attachments | Comment (unsafe `.json()` parse on 204/non-JSON responses) → fixed, approved, merged |
| [#23](https://github.com/Ohmmykung09/toktickit/pull/23) | Lab 2: Complete quality evidence and integrate requester workflow | Comment (Prisma object leaking internal fields via API) → fixed, approved, merged |

### PR #17 — my comment
> [CONFIRMED] ตาราง status code ระบุว่า 409 เป็นโค้ดมาตรฐาน แต่ไม่มี endpoint ไหนอ้างถึงเลย และ BR-12
> (กันส่งซ้ำ) ป้องกันแค่ฝั่ง frontend (disable ปุ่ม) เท่านั้น ไม่มี backend check เลย → ถ้ามี
> retry/ยิงซ้ำจากที่อื่นที่ไม่ใช่ UI จะสร้างตั๋วซ้ำได้

**Partner's response:** Added backend idempotency via `Idempotency-Key` — `201` for a new request,
`200` for an identical retry, `409` for a conflicting reuse of the same key; added a test (API-07)
verifying retries create only one ticket.

My follow-up: "Lgtm"

### PR #18 — my comment
> Since the API is expected to return the complete active list, should we assert the exact expected
> array (or at least its length) instead of only using `arrayContaining()`? This would make the test
> stricter and help catch unexpected extra records.

**Partner's response:** Fixed — lookup API tests now assert the complete expected arrays for all 7
active related systems and 4 active development requesters instead of a partial match.

My follow-up: "Ok good job ohm"

### PR #19 — my comment
> checkSystem() มี logic ซ้ำ/ซ้อนกัน — ตรง diff มีการประกาศ checkSystem() ซ้ำใน function และมีทั้ง
> การ fetch /api/categories สองรูปแบบ รวมถึงมี try/catch ซ้อนที่ดูเหมือนมาจาก code รุ่นเก่า + code
> รุ่นใหม่ถูกเอามาทับกัน

**Partner's response:** Checked the final source on the branch — only one `checkSystem()`, one
`/api/categories` call, one try/catch; the apparent duplication was the removed Lab 1 implementation
shown alongside the replacement in the diff view.

My follow-up: "Good job ohm I'm proud of you"

### PR #20 — my comment
> PR บอกว่ามีการ generate Ticket Number แต่จาก diff ที่เปิดได้ ส่วน implementation ของ
> ticket-service.ts ยังไม่ได้แสดงครบในหน้า diff ที่ผมอ่านได้

**Partner's response:** `server/src/ticket-service.ts` is a new 95-line file in this PR (GitHub had
collapsed it in the diff view); Ticket Number generation uses a `TKT-YYYYMMDD-NNNN` prefix and a
daily sequence inside a serializable Prisma transaction, verified by an API test.

My follow-up: "Well done"

### PR #21 — my comment
> ข้างบนประกาศ type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' แต่ dropdown ส่ง Low / Medium /
> High / Critical — ถ้า backend เทียบตรงๆ filter นี้จะไม่คืนอะไรเลย ลองเทสด้วยของจริงดู

**Partner's response:** Fixed — the API already normalized the query value to the Prisma enum; added
an integration test calling `/api/tickets?priority=High` with the exact title-case value the
dropdown sends, verifying only High-priority tickets are returned.

My follow-up: "Good job"

### PR #22 — my comment
> ใน removeAttachment เรียก await response.json() ทุกกรณี ถ้า DELETE ตอบ 204 No Content (ซึ่งเป็น
> convention ปกติ) .json() จะ throw SyntaxError → ตกเข้า catch → ผู้ใช้เห็นข้อความ "Unexpected end of
> JSON input" ทั้งที่ไฟล์ถูกลบไปแล้วจริง เคสเดียวกันกับ uploadAttachment — ถ้า multer เด้ง 413 หรือ
> express error handler ตอบเป็น HTML ก็พังแบบเดียวกัน

**Partner's response:** Fixed — `removeAttachment` now treats a 204 No Content DELETE as success
without parsing JSON; upload/delete errors now parse JSON only when the response actually is JSON,
with a specific message for 413; added UI tests for both the 204 delete and a non-JSON 413 upload.

My follow-up: "Good job"

### PR #23 — my comment
> attachmentInfo() เขียนเป็น return attachment เฉยๆ ถึง type จะประกาศแค่ 5 field แต่ runtime มันคืน
> object เต็มจาก Prisma รวม storedFileName, ticketId, removedByRequesterId ออกไปทาง API ด้วย ต้อง
> destructure จริงๆ เหมือนที่ทำใน /api/tickets/:ticketNumber

**Partner's response:** Fixed — `attachmentInfo()` now explicitly constructs the public attachment
metadata instead of returning the raw Prisma record; API tests now assert the exact response shape
so internal fields (storedFileName, ticketId, removedAt, removedByRequesterId) can't leak.

Outcome: all 7 reviewed, commented on with real issues found, fixed by the partner, and merged.
