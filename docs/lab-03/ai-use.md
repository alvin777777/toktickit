# Lab 3 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Fable 5.1), running as an interactive CLI agent inside VS Code
with direct shell, file, database (Docker/psql), browser-automation (Playwright), and GitHub CLI
access. The same agent acted as the *specification agent* (Issue 1) and the *coding agent*
(Issues 2–6).

## Selected key prompts

| # | Prompt Name | Actual Prompt Text | What I did with the result |
|---|---|---|---|
| 1 | Start from the handout | (Shared `Lab_3_sheet.pdf`) "ทำมา" (do it) | The agent first located the Lab 2 repo, read every Lab 2 doc, the Prisma schema, server/client code, the test suites, the PR/review history and the GitHub project board before writing a line — then proposed the six-Issue decomposition and the stacked-PR plan. I kept the decomposition. |
| 2 | Spec before code | (Implicit in #1 — the handout's Spec DD rule) | Had the agent write `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` as PR #39 *before* any implementation. The important decisions it had to make explicit: server-side sessions instead of JWT (so logout/deactivation really revoke), scrypt from Node crypto (no native dependency), Administrators may operate tickets (BR-15) because the handout lets an Administrator be a Ticket Owner, two tables for comments vs notes so the privacy boundary is structural, and "appears resolved" as a flag rather than a status. |
| 3 | Keep Lab 2 data alive | (Part of the Issue 2 contract: "migrate RequesterUser → User without losing Tickets") | Prisma's generated migration would have dropped `RequesterUser` and recreated `User`. The agent wrote the migration SQL by hand (`ALTER TABLE … RENAME`, sequence/index/constraint renames, nullable column → back-fill → `NOT NULL`) and proved it with `psql` (same ids, FK now points at `User`) and `prisma migrate status` (no drift). The migration embeds a precomputed scrypt hash of `Welcome123!` so every migrated requester is forced to change their password. |
| 4 | Don't trust a green run | (Agent noticed `migrate dev` failing with "table User does not exist" in the shadow DB) | Root cause was my hand-named migration folder timestamp (`…100000`) sorting *after* the generated one (`…031843`, UTC). The agent renamed the folders so the order is users → workflow → comments, and from then on normalised every new migration's timestamp. Same lesson when a queue pagination test flaked only in the full run: other files create tickets concurrently, so the test now sorts by ticket number ascending instead of trusting "newest first" between two requests. |
| 5 | Verify the claim before the PR | (Lab 2 reflection carried over: evidence must come from real runs) | Before opening PR #40 the agent started the real server with `tsx`, logged in with `curl`, and checked the `Set-Cookie` flags (`HttpOnly; SameSite=Lax`), the CORS credential headers, a 403 for IT Staff on a Requester route, and a 401 after logout. PR bodies list exactly what was run and what was deferred to Issue 6 (browser click-through, screenshots). |
| 6 | A PR opened on a red test | (Agent's own observation after `gh pr create` for #42) | The shell chain used the exit code of `grep`, not `npm test`, so PR #42 was created while one UI test still failed. The agent fixed the test (an ambiguous `getByText` matching both the "Internal — not visible to the requester" caption and the textarea label), re-ran the suite to 65/65, and amended + force-pushed the commit before anyone reviewed it. All later chains check the test log explicitly. |
| 7 | Unreachable rule | (Agent reasoning while writing API-33) | While writing the LAST_ADMIN test it worked out that "deactivate the last active Administrator" can never be reached through the API: any other actor would be a second active admin, and self-deactivation is refused first (BR-42). The test now exercises the reachable role-change branch and the two-admins-allowed case, the server keeps the deactivation branch as defence in depth, and the PR says so instead of pretending the test covers both. |
| 8 | Cross-file test interference | (Agent noticed `asAdmin()` failing in an unrelated file) | The first LAST_ADMIN test deactivated the seeded admin, which — by design (BR-10) — killed every other test file's admin session. Rather than serialising the whole suite, the agent rewrote the test so the seeded admin is never deactivated; the suite was then run twice to confirm stability. |

## Reflection

Lab 3 was the first sprint where the agent had to change *existing* data and behaviour instead of
adding to an empty slate, and the two biggest wins came from refusing the easy path: hand-writing
the rename migration (Prisma's default would have silently destroyed Lab 2's requesters) and
treating "a test passed" as insufficient until it also passed in the full, parallel run and against
the real server. The authorization matrix and the status-transition matrix were written as tables
in the specification first, then turned into pure functions with exhaustive unit tests, and only
then wired into routes — that order meant the API tests argued with the spec, not with my memory.

Where I still had to steer: the agent happily opened a PR on a failing test because a shell pipeline
hid the exit code, and it initially tested the LAST_ADMIN rule by deactivating the one account every
other test depends on. Both were caught by reading the actual output rather than the summary line,
which remains the single most valuable habit from Labs 1–3.
