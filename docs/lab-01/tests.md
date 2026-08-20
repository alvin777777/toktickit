# Lab 1 — Test Plan and Evidence

All test files live under `server/tests/lab-01/` and `client/tests/lab-01/`.

| # | Test File | Tool | Test | Result |
|---|-----------|------|------|--------|
| API-01 | server/tests/lab-01/health.test.ts | Supertest | GET /api/health returns 200, status=ok | ✅ Pass |
| API-02 | server/tests/lab-01/categories.test.ts | Supertest | GET /api/categories returns the 4 seeded categories in id order | ✅ Pass |
| UI-01 | client/tests/lab-01/App.test.tsx | Vitest | TokTickIT heading renders | ✅ Pass |
| UI-02 | client/tests/lab-01/App.test.tsx | Vitest | Success state shows Online + the seeded category list | ✅ Pass |
| UI-03 | client/tests/lab-01/App.test.tsx | Vitest | Error state shows Offline + a useful error message | ✅ Pass |

## How to run

```bash
cd server && npm test
cd client && npm test
```

## Terminal output (paste your own screenshot here for submission)

```
$ cd server && npm test
 ✓ tests/lab-01/health.test.ts (1 test)
 ✓ tests/lab-01/categories.test.ts (1 test)
 Test Files  2 passed (2)
      Tests  2 passed (2)

$ cd client && npm test
 ✓ tests/lab-01/App.test.tsx (3 tests)
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
