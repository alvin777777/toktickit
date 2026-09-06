# Lab 2 — AI Use and Reflection

**LLM/agent used:** Claude Code (Claude Sonnet 5), running as an interactive CLI agent with direct
shell, file, browser-automation (Playwright), and GitHub CLI access.

## Selected key prompts

| # | Prompt Name | Actual Prompt Text | What I did with the result |
|---|---|---|---|
| 1 | Explain the lab | (Shared the Lab 2 labsheet PDF) "อันนี้คือต้องทำอะไรบาง" (What do I need to do here?) | Read the summary of scope, screens, business rules, and the 6-Issue decomposition before touching any code. |
| 2 | Start the spec | "ต่อได้เลย" (go ahead) after confirming the Issue breakdown | Had the agent write `specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md` (FR/BR/AC numbering, full REST contract, Zen Green tokens, planned-test table) *before* any implementation, per Spec-Driven Development. Reviewed and approved before Issue 2 started. |
| 3 | Continue after each review | "เพื่อนรีวิวมาละ" / "ต่อเลย" (my partner reviewed it) each time a PR came back | Never took my word for "reviewed" at face value — had the agent check `gh pr view`/`gh api ... comments` for the actual review state and inline comments before proceeding, then either merge-and-continue or fix the specific issues raised. |
| 4 | Fix review feedback | (Pasted the reviewer's inline comments after "Requesting changes") | Had the agent explain each root cause before fixing — e.g. a stale-closure bug in the attachment picker, `parseInt` silently accepting `"2abc"`, Multer aborting before our own validation ran, a Node/jsdom `localStorage` conflict in tests — then add a regression test per fix, not just patch the symptom. |
| 5 | Verify claims, don't trust them | (Implicit — asked the agent to justify a PR description it wrote) | Caught the agent once claiming to have "manually clicked through the browser" when it has no browser in this environment; made it correct the PR description to only claim what was actually run (curl + automated tests), and to flag manual browser verification as still needed from me. |
| 6 | Set up responsive/E2E QA | "ต่อได้เลย" leading into Issue 6 | Had the agent set up Playwright from scratch (package, config, three viewport projects), write the full-flow and cross-Requester-isolation E2E tests and the responsive/no-horizontal-scroll + screenshot test, then actually run all of them against the real running app rather than just writing them. |
| 7 | Investigate a real test failure | (Agent surfaced a Playwright failure on its own and diagnosed it) | When the E2E flow failed only on the mobile viewport, had the agent explain why (`.first()` picks DOM order, not CSS visibility, so it grabbed the hidden desktop table row) before accepting the fix, rather than just re-running until green. |

## Reflection

The biggest improvement over Lab 1 was pushing back on "it should work now" — every fix in this
sprint (both mine and the reviewer's) got a regression test and, where possible, a real
curl/Playwright run against the live app, not just a passing unit test in isolation. The one place
I had to correct the agent: it initially wrote PR descriptions asserting things it hadn't actually
verified (manual browser clicks) — I now expect it to distinguish "ran a real command and saw this
output" from "this should work" in anything it writes as evidence.
