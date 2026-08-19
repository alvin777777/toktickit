# Lab 1 — Peer Review Record

**Author:** <your name> — <student id> — GitHub: @alvin777777
**Peer reviewer:** <partner name> — <student id> — GitHub: @Ohmmykung09

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| [#5](https://github.com/alvin777777/toktickit/pull/5) | feature/1-project-foundation | Changes requested → addressed via comment, merged |
| [#6](https://github.com/alvin777777/toktickit/pull/6) | feature/2-health-check | Approved ("LGTM"), merged |
| [#7](https://github.com/alvin777777/toktickit/pull/7) | feature/3-category-seed | Approved, merged |
| [#8](https://github.com/alvin777777/toktickit/pull/8) | feature/4-category-list | Approved ("LGTM"), merged |

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

### PR #6 — reviewer comment I received
> LGTM

No changes requested this time — approved directly, so there was nothing to fix or respond to.

### PR #7 — reviewer comment I received
> LGTM. This PR covers Issue #3: the Prisma `Category` model has `id`, unique `name`, and
> `createdAt`; the migration creates the `Category` table with a unique name index; the seed
> inserts the four required categories using `upsert`, so it is safe to run multiple times; and no
> database credentials are committed.
>
> The category API endpoint and Supertest response test are Issue #4 scope, so I don't see them as
> blockers here.

Approved directly — nothing to fix or respond to.

### PR #8 — reviewer comment I received
> LGTM. This PR correctly covers Issue #4, not Issue #3. It adds `GET /api/categories`, retrieves
> categories from PostgreSQL through Prisma, orders them by `id`, returns only `{ id, name }`, adds
> a Supertest test for the API response, updates `checkSystem()` to fetch real categories, and adds
> a Vitest success-state test for displaying the category list.
>
> Issue #3 was already covered by PR #7 with the Prisma model, migration, and idempotent seed. I
> don't see any blocker for this PR.

Approved directly — nothing to fix or respond to.

## Pull Requests I reviewed for my partner
My comment: <...>
Partner's response: <...>
