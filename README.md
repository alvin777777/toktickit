# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk application, built incrementally across CPE 334 lab
sprints. Lab 1 delivered a thin vertical slice — React UI → Express REST API → Prisma ORM →
PostgreSQL — proving the full stack works together end to end. Lab 2 added the Requester-facing
ticketing MVP (Create Ticket, My Tickets, Ticket Detail, Attachments). Lab 3 replaces the temporary
Development Requester selector with real email/password login, server-side sessions, and three
roles — Requester, IT Staff, Administrator — plus the IT Staff Ticket Queue / Ticket Detail workflow
and Administrator User Management. Lab 4 completes the workflow: IT Staff record **Actions Taken**
under each Ticket, the backend only lets a Ticket be **Resolved** once that work supports it,
every status change is kept in an append-only **history**, and every role starts on a **Dashboard**
whose numbers link to the filtered lists.

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
│       ├── lab-01/ … lab-04/
│       ├── helpers/    auth + ticket helpers shared by the API tests
│       └── setup.ts    test-only Supertest transport fix (see docs/lab-04/tests.md §7)
├── docs/
│   ├── lab-01/         ai_use.md, reviewer.md, tests.md
│   ├── lab-02/         specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md
│   ├── lab-03/         specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md
│   └── lab-04/         specification.md, api-spec.md, ui-spec.md, tests.md, reviewer.md, ai-use.md
├── e2e/                Playwright E2E + responsive/visual QA (lab-02/, lab-03/, lab-04/)
├── artifacts/
│   ├── lab-02/screenshots/   desktop/tablet/mobile screenshots from the Lab 2 E2E suite
│   ├── lab-03/screenshots/   authentication / staff-queue / staff-ticket-detail / user-management
│   └── lab-04/screenshots/   staff-dashboard / requester-dashboard / actions-taken
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
`server/.env` also carries `CLIENT_ORIGIN` (Lab 3) — the only browser origin allowed to call the
API with the session cookie (CORS) **and** the origin every state-changing request must present in
its `Origin`/`Referer` header (CSRF control, BR-09a). Leave it at `http://localhost:5173` for the
Vite dev server; when calling the API from curl or scripts, add `-H "Origin: http://localhost:5173"`
to POST/PATCH/DELETE requests.

## 4. Set up the database with Prisma

```bash
cd server
npx prisma migrate dev   # applies all migrations (Lab 3 renames RequesterUser → User in place;
                         # Lab 4 adds ActionTaken, TicketStatusHistory, Ticket.version/resolvedAt)
npm run prisma:seed      # idempotent — safe to re-run any time; resets seeded accounts/passwords
```

### Lab 4 migration and rollback

`20261031100000_lab4_actions_taken` is additive: it creates the Actions Taken and status-history
tables, adds `Ticket.version` and `Ticket.resolvedAt`, and back-fills legacy rows (one history row
per existing Ticket, `resolvedAt` for Resolved/Closed ones). Existing Tickets simply have no
actions yet; they must get a completed action before they can next be resolved.

To roll it back (Lab 4 data is lost, so take a `pg_dump` first):

```bash
cd server
docker exec -i toktickit-db psql -U toktickit -d toktickit < prisma/rollback/20261031100000_lab4_actions_taken.down.sql
npx prisma migrate resolve --rolled-back 20261031100000_lab4_actions_taken
```

Up → down → up is tested on a scratch database by `server/tests/lab-04/migration.api.test.ts`.

### A clean database for demos and E2E (optional)

The automated tests add many Tickets to the dev database. For a demo or the E2E suite you can use a
separate, freshly seeded database without touching your dev data:

```bash
docker exec toktickit-db psql -U toktickit -c "DROP DATABASE IF EXISTS toktickit_demo" -c "CREATE DATABASE toktickit_demo"
cd server
export DATABASE_URL="postgresql://toktickit:toktickit@localhost:5434/toktickit_demo?schema=public"
npx prisma migrate deploy && npm run prisma:seed
npm run dev              # this terminal's server now uses toktickit_demo
```

### Seeded accounts (local development only)

All seeded accounts use the password **`Password123!`** except the first-login account, which uses
the initial password **`Welcome123!`** and must change it at first sign-in. Accounts that existed
before Lab 3 and are *not* re-seeded are migrated as **unprovisioned**: nobody can sign into them
until an Administrator sets an initial password in Users → Edit → Set Initial Password
(`docs/lab-03/specification.md` BR-46).

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
accounts above. Since Lab 4 every role lands on its **Dashboard** (see
[docs/lab-04/ui-spec.md](docs/lab-04/ui-spec.md) §2).

### Lab 4 demo walkthrough (seeded data)

1. **IT Staff** — sign in as `emily.davis@toktickit.dev`. The Dashboard shows the operational cards;
   click **Unassigned** to open the Queue already filtered.
2. Open **TKT-2026-000001** ("Laptop battery drains quickly"): Actions Taken lists three actions by
   two staff members, one needing follow-up and one planned. The Status control does not offer
   *Resolved*, and the "To resolve this ticket" checklist says why.
3. Edit the planned action → **Start** → **Complete** (Result is required), then add an action
   without follow-up: *Resolved* becomes available. Resolve and check the **History** tab.
4. **Requester** — sign in as `jennifer.anderson@toktickit.dev`: Dashboard cards (*Waiting for Me*,
   *Resolved*, …) open My Tickets filtered; the Ticket shows its Actions Taken and status history,
   read-only.
5. **Administrator** — `john.smith@toktickit.dev` sees the same operational dashboard plus user
   account counts linking to Users.

## 6. Run automated tests

```bash
cd server && npm test
cd client && npm test
```

## 7. Run the E2E / responsive-visual suite (Labs 2–4)

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
`artifacts/lab-03/screenshots/`) at desktop, tablet, and mobile viewport widths, and the Lab 4
suite (`e2e/lab-04/` — Actions Taken flow, resolution gate, dashboards incl. keyboard checks, and
responsive screenshots saved to `artifacts/lab-04/screenshots/`). Run it against a freshly seeded
database (see "A clean database" above) for predictable screenshots.

## Git workflow

This project follows a feature-branch → staging branch → `main` flow, one staging branch per lab
(`lab1-staging`, `lab2-staging`, ...). See docs/lab-0N/reviewer.md for peer-review records and
docs/lab-0N/tests.md for each sprint's test plan and evidence.
