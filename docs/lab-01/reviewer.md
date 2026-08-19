# Lab 1 — Peer Review Record

**Author:** <your name> — <student id> — GitHub: @alvin777777
**Peer reviewer:** <partner name> — <student id> — GitHub: @Ohmmykung09

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| [#5](https://github.com/alvin777777/toktickit/pull/5) | feature/1-project-foundation | Changes requested → addressed via comment, merged |
| | feature/2-health-check | |
| | feature/3-category-seed | |
| | feature/4-category-list | |

### PR #5 — reviewer comment I received
> This PR mostly covers Issue #1 foundation requirements: React/Vite/TypeScript, Bootstrap,
> Express/TypeScript, Prisma setup, env examples, gitignore, test tooling, and README are present.
>
> Request changes: I would not close Issue #1 yet because the server test suite is not green. The
> active health test expects `/api/health` to return 200, but the route still returns 501. Please
> either keep the health endpoint/test as Issue #2 scope, or implement it here and make
> `cd server && npm test` pass.

### How I responded
> Thanks for the review! You're right that `cd server && npm test` isn't green yet — that's
> expected at this stage: per the Lab 1 spec, `GET /api/health` returning 200 is an **Issue 2**
> acceptance criterion, not Issue 1. Issue 1's criterion is only that "Vitest and Supertest commands
> are configured" (i.e. the tooling runs), which it does — the health test currently fails against
> the stub route on purpose, since the real endpoint ships in Issue 2.
>
> I already have Issue #2 (`feature/2-health-check`) open next to implement the real `/api/health`
> route and turn that test green. Keeping the scope split this way matches the labsheet's Issue
> breakdown and dependency order (Issue 1 → Issue 2). Will ping you again once #2's PR is up.

See: https://github.com/alvin777777/toktickit/pull/5#issuecomment-5341969426

## Pull Requests I reviewed for my partner
My comment: <...>
Partner's response: <...>
