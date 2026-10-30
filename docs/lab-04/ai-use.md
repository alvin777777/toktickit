# Lab 4 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Opus 5.5), running as a CLI agent inside VS Code with
direct shell, file, database (Docker/psql), browser-automation (Playwright), and GitHub CLI access.
The same agent acted as the *specification agent* (Issue 1, PR #60) and the *coding agent*
(Issues 2–6, PRs #61–#65).

## Selected key prompts

| # | Prompt Name | Actual Prompt Text | What I did with the result |
|---|---|---|---|
| 1 | Start from the handout | (Shared `SE Lab 4.pdf`) "ช่วยทำให้หน่อยครับ" (please do it for me) | The agent read every Lab 3 doc, the Prisma schema, all routes, the client pages, the test helpers, and the PR/review history, then ran the Lab 1–3 suites as a baseline (150 server + 75 client tests green) before writing anything. It proposed the six-Issue, stacked-PR plan used in Lab 3; I kept it. |
| 2 | Spec before code | (Handout §9 — Spec DD) | Specification, API, UI, and test plan were committed and opened as PR #60 before any implementation. Decisions it had to make explicit because the handout leaves them open: Actions Taken get their own status (Planned / In Progress / Completed / Cancelled) and Completed is final; the resolution gate (owner + ≥1 completed action + no open action + latest completed action has no pending follow-up); "Performed by" defaults to the recorder but can be another active IT Staff; integer `version` columns for stale-update detection; every role lands on `/dashboard`. |
| 3 | Keep Lab 3 data alive | (Handout §5.2 — migration must preserve all data and be reversible) | Prisma generated the additive SQL; the agent added the back-fill (`resolvedAt` for legacy Resolved/Closed, one history row per Ticket) and wrote a rollback script. MIG-05 builds a real Lab 3 database from the checked-in migrations, applies Lab 4, rolls back, and re-applies, the same technique my partner asked for in the Lab 3 review. |
| 4 | Don't weaken the gate to pass old tests | (Agent's decision when 4 Lab 3 tests failed after adding BR-20) | The Lab 3 tests resolved Tickets with no recorded work. Instead of relaxing the gate, the agent amended those tests to record a completed action first, documented it as BR-38, and deleted no Lab 3 test. |
| 5 | A commit on a red run — again | (Agent's own observation, Issue 3) | The shell chain checked `grep`'s exit code instead of the test runner's, so the Issue 3 commit was pushed after a run with one failing test, the exact mistake recorded in my Lab 3 ai-use.md. The agent said so, fixed the cause in a second commit (no PR existed yet), noted it in the PR body, and from then on gated commits on `vitest run`'s own exit code. |
| 6 | Impossible symptoms mean a hidden cause | (Agent's investigation of the flaky suite) | Looping the full suite showed 4/10 failing runs with impossible symptoms: a login returning 404 with an empty body, "socket hang up", a Requester getting 404 where the guard returns 403. The agent first disproved its own keep-alive theory, ran untouched `main` 6 times as a control (green), then logged every 404 the app sent. The failing 404 never came from our app: Supertest binds `[::]` but connects to `127.0.0.1`, and on this Mac other apps (VS Code, LINE, CurseForge) hold `127.0.0.1` ports, so requests occasionally reached them. Fix: Supertest connects over `[::1]`. A second, real bug surfaced in the same loop: Lab 3's queue counted `totalItems` and `counts.all` in separate statements, now one REPEATABLE READ snapshot. Result: 0/10 failing runs. |
| 7 | Prove the numbers, don't eyeball them | (Handout Part 5 — "evidence that selected metrics match database queries") | Every dashboard metric returns the list query that reproduces it. API-21/24 compare three numbers per metric: dashboard value, direct Prisma count of the BR-28/29 definition, and the drill-down list's `totalItems`. Requester and "mine" metrics use freshly created users so the comparison is exact; global metrics retry until a quiet moment gives three equal numbers. |
| 8 | Look at it in a browser | (Agent's check before each UI PR) | Playwright screenshots at 1280 and 390 px before opening #63 and #64 caught that an in-page card link wouldn't scroll (fixed with a plain anchor) and confirmed no horizontal overflow. A clipped "Open" column in the Queue turned out to be test-data volume, not layout; the agent verified that on a freshly seeded database instead of restyling a Lab 3 table on a guess. UI-07 also caught a real bug: `ConfirmBox` buttons defaulted to `type="submit"`, so confirming inside a form submitted it twice. |
| 9 | Clean evidence without destroying my data | (Agent's decision for E2E / screenshots) | My dev database held ~5,700 leftover test Tickets. Instead of resetting it, the agent created a separate `toktickit_demo` database, ran the full E2E suite on a fresh copy (64 passed), then rebuilt it again so the committed screenshots show only seeded data. It also restored the Lab 2/3 screenshots that re-running their specs had overwritten. |

## My Reflection

> _Draft prepared with the agent; rewrite in your own words before submitting._

**Specification agent.** Writing the contract first paid off most where the handout was vague:
"assign, complete, cancel" in the grading table only made sense once Actions Taken had their own
status, and the resolution rule only became testable once it was written as four concrete
conditions with error codes. Having the dashboard metrics as a table (definition plus drill-down
query) meant "the card equals the list" became a test, not a hope.

**Coding agent.** The most valuable habit was refusing to accept a green or red result without
knowing why. The flaky suite looked like a race in my new code, but the evidence (a 404 my app
never sent) pointed outside the app entirely; guessing would have led to "fixing" correct code.
I still had to steer: the agent repeated the Lab 3 mistake of trusting a shell pipeline's exit
code, and the Lab 3 tests it had to amend could easily have been "fixed" by weakening the new rule.
Keeping the old tests and changing only what the new rules really changed is what makes the
regression claim believable.
