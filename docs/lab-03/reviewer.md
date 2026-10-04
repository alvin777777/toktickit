# Lab 3 — Peer Review Record

**Author:** ไอโว ปีเตอร์ อัลวิน รันเน่ — 67070501051 — GitHub: @alvin777777
**Peer reviewer:** ทิฐินันท์ สอบกิ่ง — 67070501018 — GitHub: @Ohmmykung09

## Pull Requests I authored (reviewed by my partner)

The six Lab 3 PRs are **stacked**: each one's base is the previous feature branch, so the reviewer
sees only that Issue's diff. They are merged into `lab3-staging` in order (merge commit, delete
the branch) — GitHub retargets the next PR automatically once its base branch is gone. After the
first review round every fix was committed on its own layer and the stack was rebased upward, so
each PR still shows exactly its Issue.

| PR | Branch | Scope | Reviewer verdict |
|----|--------|-------|------------------|
| [#39](https://github.com/alvin777777/toktickit/pull/39) | feature/11-lab3-spec | Sprint 3 engineering contract | Changes requested (3 × P1, 2 × P2) → all fixed in `26f66f9` → approved ("LGTM!"), merged |
| [#40](https://github.com/alvin777777/toktickit/pull/40) | feature/12-auth-foundation | Authentication, sessions, User migration | Changes requested (4 × P1, 1 × P2) → all fixed → approved ("LGTM!"), merged |
| [#41](https://github.com/alvin777777/toktickit/pull/41) | feature/13-staff-ticket-queue | Ticket workflow data, Ticket Queue | Changes requested (2 × P1) → all fixed → approved ("LGTM!"), merged |
| [#42](https://github.com/alvin777777/toktickit/pull/42) | feature/14-staff-ticket-operations | IT Staff Ticket Detail, comments, notes | Changes requested (2 × P1) → all fixed → approved ("LGTM!"), merged |
| [#43](https://github.com/alvin777777/toktickit/pull/43) | feature/15-admin-user-management | Administrator User Management | Changes requested (2 × P1) → all fixed → approved ("LGTM!"), merged |
| [#44](https://github.com/alvin777777/toktickit/pull/44) | feature/16-e2e-qa-release | E2E, responsive/visual QA, final docs | **Approved** ("no blocking issues"), merged |
| [#45](https://github.com/alvin777777/toktickit/pull/45) | feature/15-admin-user-management → lab3-staging | Integration of the merged stack | merged (see note below) |
| — | lab3-staging → main | Lab 3 release | see the release PR link in the submission |

**Integration note.** The second-round merges were done without deleting the base branches, so GitHub
did not retarget the stacked PRs: #40–#44 each merged into the previous feature branch and only #39
reached `lab3-staging`. PR #45 brought the merged stack (`feature/15-admin-user-management`) into
`lab3-staging`, and the reviewed head of #44 (`b261cd0`, whose merge commit had been lost from
`feature/15` by a later force-push) was merged in directly afterwards (`3b88204`). The content on
`lab3-staging` is exactly what the partner approved, plus the docs/E2E-helper commit `1a07bac` that
followed the #44 approval.

### PR #39 — reviewer comment I received
> Requesting changes because the engineering contract still contains migration blockers and
> security/authorization gaps that can make the implementation diverge across the spec, API, and
> tests. Please resolve the inline findings before Issue 2 starts.

Inline findings: **[P1]** `SameSite=Lax` + CORS is not sufficient CSRF protection (same-site ≠
same-origin; simple form / `no-cors` POSTs bypass CORS; logout, claim, requester-resolved,
multipart create are forgeable) — require a CSRF token or validate `Origin`/`Referer` on every
unsafe method; **[P1]** `User.updatedAt` is `NOT NULL` with no default/back-fill, so the migration
fails on a populated Lab 2 table, and the migration test must apply the real migration to a Lab 2
schema; **[P1]** back-filling every migrated account with one precomputed `Welcome123!` hash
breaks BR-04/UNIT-01 and lets anyone take over a migrated account before its owner signs in;
**[P2]** BR-29 only forbids *entering* RESOLVED without an owner although api-spec/API-18 also
refuse unassigning a resolved ticket — state the invariant; **[P2]** SEC-05 covered only IT Staff
and only two routes — exercise both disallowed roles across every Requester-only route.

### How I responded
> All 5 addressed in 26f66f9: **BR-09a** — every unsafe method must present an `Origin` (or
> `Referer`) equal to `CLIENT_ORIGIN`, checked before authentication → 403 `CSRF_REJECTED`
> (AC-34, SEC-09; implemented + tested in #40). **BR-46a** — add nullable → back-fill (`updatedAt`
> from `createdAt`, `itPriority` from `requestedPriority`) → NOT NULL; MIG-01 applies the real SQL
> to a scratch Lab 2 schema. **BR-46** rewritten — migrated accounts get a per-row
> `unprovisioned$<uuid>` sentinel the verifier can never match; an Administrator provisions them
> (BR-44). **BR-29** is now the invariant "a RESOLVED ticket always has an owner". **SEC-05**
> covers IT Staff and Administrator across every Requester-only route. Added AC-35/36 and
> API-35..38 for the concurrency/atomicity findings on #42/#43.

Partner's response: "LGTM!" — approved and merged.

### PR #40 — reviewer comment I received
> ขอ Request changes ครับ พบประเด็นที่กระทบ security และ acceptance criteria ของ Issue 2: CSRF
> protection ยังไม่ครอบคลุม unsafe simple requests, migration ใช้ credential เดียวกันกับ fixed salt
> สำหรับผู้ใช้เดิม, client ไม่จัดการ session ที่ถูก revoke ระหว่างใช้งาน, และ migration regression
> test ยังไม่ได้รัน migration จริงกับ Lab 2 schema

Inline findings: **[P1]** CORS/SameSite is not a CSRF defence for simple requests — check
`Origin`/`Referer` or use a token and add forged-request tests; **[P1]** every migrated user shares
one fixed-salt `Welcome123!` hash — generate per-user credentials / safe provisioning; **[P1]**
`apiFetch` throws on 401 but nothing clears `AuthContext` or redirects, so a revoked session leaves
the UI looking signed in (AC-30) — centralise 401 handling incl. `downloadAttachment` and test it;
**[P1]** MIG-01 only inspects the connected DB and cannot fail if the rename/back-fill/FK were
wrong — build a Lab 2 schema and apply the migration for real; **[P2]** password update and
session revocation are separate writes — wrap in one transaction and test the failure path.

### How I responded
> แก้ครบทั้ง 5 จุด: `csrfOriginCheck` middleware ก่อน cookie/auth (403 `CSRF_REJECTED`, ครอบทุก
> route รวม logout/multipart) + `csrf.api.test.ts` จำลอง forged Origin / foreign Referer / ไม่มี
> header; migration ให้ sentinel `unprovisioned$<uuid>` แยกต่อแถว + `updatedAt` add nullable →
> backfill → NOT NULL; `apiFetch`/`downloadAttachment` ส่ง event เมื่อเจอ 401 แล้ว `AuthProvider`
> ล้าง user → `RequireAuth` พากลับ /login (`SessionExpiry.test.tsx`); MIG-01 สร้าง scratch DB จาก 3
> migration ของ Lab 2 + fixture แล้ว apply SQL ของ Lab 3 จริง; change-password ใช้
> `$transaction([update, deleteMany])` + `atomicity.api.test.ts` inject ให้ transaction ล้ม

Partner's response: "LGTM!" — approved and merged.

### PR #41 — reviewer comment I received
> ขอ Request changes ครับ พบ blocker 2 จุดที่ทำให้ queue ใช้งานจริงและข้อมูล seed ไม่ตรงกับ contract:
> row/card ใน Ticket Queue นำทางไป route ที่ยังไม่มี และ seed ผูก ticket กับผู้ใช้ IT Staff ที่ inactive
> ซึ่งผิด BR-23

Inline findings: **[P1]** rows/cards navigate to `/staff/tickets/:ticketNumber`, which this PR does
not register, so a click falls through to the queue instead of a detail; **[P1]** the grade-export
seed ticket is owned by Robert Wilson, who is seeded inactive — violates BR-23 and never appears in
`/api/staff/assignees`.

### How I responded
> เอา navigation ออกจาก PR นี้ตามข้อเสนอ — route และ action เปิด detail ย้ายไป #42 พร้อมหน้า detail
> จริง (รวม test); เปลี่ยน owner เป็น Lisa Martinez และ `seedTickets()` throw ถ้า owner ไม่ใช่ active
> IT_STAFF/ADMIN

Partner's response: "LGTM!" — approved and merged.

### PR #42 — reviewer comment I received
> ขอ Request changes ครับ พบ race condition ที่ทำให้กฎแบบ exactly-once/first-wins ของ Issue 4 ไม่ปลอดภัย
> เมื่อมี request พร้อมกัน: การ Claim และ Problem Appears Resolved แยกอ่านสถานะกับ update โดยไม่มี
> เงื่อนไข atomic

Inline findings: **[P1]** Claim reads `ownerId` then updates unconditionally — two staff can both
win; **[P1]** `requesterResolvedAt` check and write are separate queries — two requests both get
200 (BR-32).

### How I responded
> ทั้งสองจุดเป็น conditional `updateMany` ครั้งเดียว (`ownerId IS NULL` / `requesterResolvedAt IS
> NULL` + not terminal) ถ้า `count === 0` ค่อยอ่านซ้ำแล้วตอบ 409 ที่ถูกต้อง; test API-35/API-36 ยิง
> พร้อมกัน 2 request 3 รอบ ได้ [200, 409] ทุกรอบ

Partner's response: "LGTM!" — approved and merged.

### PR #43 — reviewer comment I received
> Requesting changes. The admin safeguards need to be made atomic so the invariants continue to
> hold under concurrent requests and partial database failures.

Inline findings: **[P1]** the LAST_ADMIN check is not atomic with the update — two concurrent
requests can both see two active admins and leave zero; **[P1]** password update and session
revocation are separate writes — a failure after the update leaves the new password active and old
sessions alive (BR-44).

### How I responded
> PATCH runs inside `$transaction` with `SELECT … FOR UPDATE` on the active Administrator rows
> before the LAST_ADMIN decision; conflicts roll back and map to the documented 404/409. API-37
> demotes the two remaining admins concurrently: exactly one 200, the loser 409 LAST_ADMIN or 403
> FORBIDDEN (if the winner committed first), never [200, 200], one admin always remains.
> `initial-password` and deactivation revoke sessions inside the same transaction;
> `atomicity.api.test.ts` injects a failing transaction and checks nothing changed.

Partner's response: "LGTM!" — approved and merged.

### PR #44 — reviewer comment I received
> Reviewed the changed source, E2E coverage, responsive checks, screenshots, and Lab 3
> documentation. I found no blocking issues in this PR. The User Management accessibility fix is
> correctly reflected in the client test updates, and the added E2E flows exercise the documented
> authentication, ticket operations, user administration, and responsive-layout requirements.

Outcome: approved and merged. (Rebased on the fixed stack afterwards; the E2E helper now sends the
`Origin` header required by BR-09a and the docs record the review round.)

## Pull Requests I reviewed for my partner

Partner's repo: https://github.com/Ohmmykung09/toktickit

| PR | Branch/Scope | Outcome |
|----|--------|------------------|
| [#61](https://github.com/Ohmmykung09/toktickit/pull/61) | Lab 3: cumulative review for Issues #26–#35 (`lab3-staging` vs `lab2-staging`, 110 files) | Changes requested (3 × P1, 3 × P2, P3 notes) → all fixed in `ae73f56` → approved ("LGTM"), merged by me as reviewer |

### PR #61 — my review
Read the whole server diff (auth-service / auth-router / admin-router / staff-router /
communication-router / app.ts / migrations / schema) and the client (App.tsx, AuthGate). Findings:

> **[P1] My Tickets only knows `NEW`.** `server/src/app.ts:154` `ticketStatus()` returns `null`
> (→ 400) for every other value, `displayStatus()` humanizes only NEW, and the dropdown in
> `client/src/App.tsx:382` offers "All statuses / New". Now that tickets travel through eight
> statuses, a Requester cannot filter their own tickets and sees raw enum labels — a Lab 2
> regression (status filter BR) and against handout §8.2.
>
> **[P1] Login timing oracle.** `auth-service.ts:140-148` throws immediately for unknown /
> inactive / unprovisioned / locked accounts without running `passwordMatches`, while real
> accounts pay the argon2id cost — response time reveals whether an email exists, contradicting
> BR-01; API-01 checks status/body only. Verify against a dummy hash on every path.
>
> **[P1] Lockout (BR-05) is an unrecoverable DoS.** Anyone who knows an email (all seeded ones are
> in README) can lock the only Administrator with five wrong passwords every 15 minutes; the
> handout excludes account unlocking, so there is no way out. Throttle per source / (ip, email)
> or back off without closing the account, and test it.
>
> **[P2] Inactive accounts get the generic message** although handout §8.1 / rubric Part 5 ask
> for distinct inactive handling — compromise: say "inactive" only when the password is correct.
>
> **[P2] Deactivating/demoting staff unassigns *every* ticket they own, including RESOLVED/CLOSED**
> (`admin-router.ts:216-227`), erasing accountability on terminal tickets and contradicting the
> intent of BR-17; keep owners on terminal tickets (inactive users are already excluded from
> assignees).
>
> **[P2] Problem Appears Resolved is accepted on CANCELLED/CLOSED tickets**
> (`communication-router.ts:102` checks only `requesterResolutionIndicatedAt: null`), and Public
> Comments post on CANCELLED tickets — document or block.
>
> **[P3]** name edits count as `profileChanged` and revoke all sessions; `search` of whitespace /
> >100 chars returns 400 instead of being trimmed/ignored; `lastUsedAt` is written on every
> request before the CSRF check; `User.updatedAt` keeps a DB default while the schema is plain
> `@updatedAt` — check `prisma migrate diff` for drift.
>
> Liked: optimistic concurrency via `updatedAt`, actor row locked in every mutation, separate
> PublicComment/InternalNote tables, provisioning via `passwordHash NULL` + CHECK constraints.

**Partner's response:** "Thanks for the detailed review. I addressed all requested changes in
commit ae73f568" — My Tickets accepts/labels all eight statuses; login always runs Argon2id
against a dummy hash before a generic failure; global lockout replaced by bounded progressive
backoff; a correct password on an inactive account returns 403 `ACCOUNT_INACTIVE`; deactivation /
demotion keeps ownership on RESOLVED/CLOSED/CANCELLED tickets; Problem Appears Resolved and Public
Comments rejected on CLOSED/CANCELLED; name-only edits no longer revoke sessions, blank searches
ignored, `lastUsedAt` touched only after auth/CSRF; `User.updatedAt` migration fix + regression
tests + docs.

My follow-up: verified the diff of `ae73f56` point by point and approved ("LGTM"), then merged
the PR as the reviewer once the partner re-sent the collaborator invitation (the earlier one had
expired).

Outcome: fixed, approved, merged (2026-10-04).
