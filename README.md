# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk application, built incrementally across CPE 334 lab
sprints. Lab 1 delivered a thin vertical slice — React UI → Express REST API → Prisma ORM →
PostgreSQL — proving the full stack works together end to end. Lab 2 adds the Requester-facing
ticketing MVP (Create Ticket, My Tickets, Ticket Detail, Attachments) behind a temporary
Development Requester selector that stands in for real login until Lab 3.

## Tech stack

| Layer    | Technology                              |
|----------|------------------------------------------|
| Frontend | React + TypeScript + Vite + Bootstrap    |
| Backend  | Node.js + Express + TypeScript           |
| Database | PostgreSQL + Prisma                      |
| Testing  | Vitest (frontend/unit) + Supertest (API) |

## Repository structure

```
toktickit/
├── client/            React + Vite frontend (pages/, components/, context/)
├── server/             Express API, Prisma schema, seed
│   ├── prisma/
│   ├── src/
│   └── tests/
│       ├── lab-01/
│       └── lab-02/
├── docs/
│   ├── lab-01/         ai_use.md, reviewer.md, tests.md
│   └── lab-02/         specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md
├── e2e/                Playwright E2E + responsive/visual QA (lab-02/)
├── artifacts/
│   └── lab-02/screenshots/   desktop/tablet/mobile screenshots from the E2E suite
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 20+ and npm
- Docker (used to run PostgreSQL locally)
- Git

## 1. Clone and install dependencies

```bash
git clone https://github.com/alvin777777/toktickit.git
cd toktickit

cd server && npm install
cd ../client && npm install
```

## 2. Start PostgreSQL (via Docker)

```bash
docker run --name toktickit-db \
  -e POSTGRES_USER=toktickit \
  -e POSTGRES_PASSWORD=toktickit \
  -e POSTGRES_DB=toktickit \
  -p 5434:5432 \
  -d postgres:16
```

(Port 5434 is used on the host to avoid clashing with other local Postgres containers. To restart it later: `docker start toktickit-db`.)

## 3. Configure environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

The defaults already match the Docker command above, so no editing is required for local dev.

## 4. Set up the database with Prisma

```bash
cd server
npx prisma migrate dev   # applies all migrations, including Lab 2's RequesterUser table
npm run prisma:seed      # idempotent — safe to re-run any time
```

## 5. Run the app locally

In two terminals:

```bash
# terminal 1 — backend (http://localhost:3001)
cd server && npm run dev

# terminal 2 — frontend (http://localhost:5173)
cd client && npm run dev
```

Open http://localhost:5173 in a browser. It redirects to **Select Development Requester** — pick
one of the seeded requesters (this is a Lab 2 testing mechanism, not real login; see
[docs/lab-02/specification.md](docs/lab-02/specification.md) BR-03) — then Continue into the app.

## 6. Run automated tests

```bash
cd server && npm test
cd client && npm test
```

## 7. Run the E2E / responsive-visual suite (Lab 2)

Requires both dev servers from step 5 running, and the DB seeded (step 4).

```bash
cd e2e
npm install
npx playwright install chromium   # first time only
npm test
```

This runs `e2e/lab-02/requester-ticket-flow.spec.ts` (full create → find → open flow, plus
cross-Requester isolation) and `e2e/lab-02/responsive.spec.ts` (checks for horizontal scrolling
and saves screenshots to `artifacts/lab-02/screenshots/`) at desktop, tablet, and mobile
viewport widths.

## Git workflow

This project follows a feature-branch → staging branch → `main` flow, one staging branch per lab
(`lab1-staging`, `lab2-staging`, ...). See docs/lab-0N/reviewer.md for peer-review records and
docs/lab-0N/tests.md for each sprint's test plan and evidence.
