# TokTickIT

TokTickIT (ตอกติ๊กกิต) is an IT service desk application, built incrementally across CPE 334 lab
sprints. Lab 1 delivers a thin vertical slice — React UI → Express REST API → Prisma ORM →
PostgreSQL — proving the full stack works together end to end.

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
├── client/            React + Vite frontend
├── server/             Express API, Prisma schema, seed
│   ├── prisma/
│   ├── src/
│   └── tests/lab-01/
├── docs/
│   └── lab-01/         ai_use.md, reviewer.md, tests.md
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
npx prisma migrate dev --name init
npm run prisma:seed
```

## 5. Run the app locally

In two terminals:

```bash
# terminal 1 — backend (http://localhost:3001)
cd server && npm run dev

# terminal 2 — frontend (http://localhost:5173)
cd client && npm run dev
```

Open http://localhost:5173 in a browser, then click **Check System**.

## 6. Run automated tests

```bash
cd server && npm test
cd client && npm test
```

## Git workflow

This project follows a feature-branch → `lab1-staging` → `main` flow. See
[docs/lab-01/reviewer.md](docs/lab-01/reviewer.md) for peer-review records and
[docs/lab-01/tests.md](docs/lab-01/tests.md) for the test plan and evidence.
