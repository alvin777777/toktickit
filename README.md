# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk application, built incrementally across CPE 334 lab
sprints. Lab 1 delivered a thin vertical slice — React UI → Express REST API → Prisma ORM →
PostgreSQL — proving the full stack works together end to end. Lab 2 added the Requester-facing
ticketing MVP (Create Ticket, My Tickets, Ticket Detail, Attachments). Lab 3 replaces the temporary
Development Requester selector with real email/password login, server-side sessions, and three
roles — Requester, IT Staff, Administrator — plus the IT Staff Ticket Queue / Ticket Detail workflow
and Administrator User Management.

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
│   ├── lab-02/         specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md
│   └── lab-03/         specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md
├── e2e/                Playwright E2E + responsive/visual QA (lab-02/, lab-03/)
├── artifacts/
│   ├── lab-02/screenshots/   desktop/tablet/mobile screenshots from the Lab 2 E2E suite
│   └── lab-03/screenshots/   authentication / staff-queue / staff-ticket-detail / user-management
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
`server/.env` also carries `CLIENT_ORIGIN` (Lab 3) — the browser origin allowed to send the session
cookie; leave it at `http://localhost:5173` for the Vite dev server.

## 4. Set up the database with Prisma

```bash
cd server
npx prisma migrate dev   # applies all migrations (Lab 3 renames RequesterUser → User in place)
npm run prisma:seed      # idempotent — safe to re-run any time; resets seeded accounts/passwords
```

### Seeded accounts (local development only)

All seeded accounts use the password **`Password123!`** except the first-login account, which uses
the initial password **`Welcome123!`** and must change it at first sign-in (this is also the initial
password every Lab 2 Requester received from the Lab 3 migration).

| Role | Email | Note |
|---|---|---|
| Requester | jennifer.anderson@toktickit.dev, michael.brown@…, sarah.johnson@…, david.lee@… | active |
| Requester | former.employee@toktickit.dev | inactive (cannot sign in) |
| Requester | alex.thompson@toktickit.dev | `Welcome123!`, must change password at first login |
| IT Staff | emily.davis@toktickit.dev, kevin.patel@…, lisa.martinez@… | active |
| IT Staff | robert.wilson@toktickit.dev | inactive |
| Administrator | john.smith@toktickit.dev | active |

Never reuse these values outside local development; see `docs/lab-03/specification.md` BR-04/BR-08.

## 5. Run the app locally

In two terminals:

```bash
# terminal 1 — backend (http://localhost:3001)
cd server && npm run dev

# terminal 2 — frontend (http://localhost:5173)
cd client && npm run dev
```

Open http://localhost:5173 in a browser. It redirects to **Sign in** — use one of the seeded
accounts above. Requesters land on My Tickets, IT Staff on the Ticket Queue, Administrators on
Users (see [docs/lab-03/ui-spec.md](docs/lab-03/ui-spec.md) §2).

## 6. Run automated tests

```bash
cd server && npm test
cd client && npm test
```

## 7. Run the E2E / responsive-visual suite (Lab 2 + Lab 3)

Requires both dev servers from step 5 running, and the DB seeded (step 4).

```bash
cd e2e
npm install
npx playwright install chromium   # first time only
npm test
```

This runs the Lab 2 suite (`e2e/lab-02/` — Requester flow and responsive checks, now signing in as
a seeded Requester) and the Lab 3 suite (`e2e/lab-03/` — authentication and first-login password
change, IT Staff ticket flow, user administration, and responsive screenshots saved to
`artifacts/lab-03/screenshots/`) at desktop, tablet, and mobile viewport widths.

## Git workflow

This project follows a feature-branch → staging branch → `main` flow, one staging branch per lab
(`lab1-staging`, `lab2-staging`, ...). See docs/lab-0N/reviewer.md for peer-review records and
docs/lab-0N/tests.md for each sprint's test plan and evidence.
