-- Lab 3 Issue 2 — docs/lab-03/specification.md §7 migration 1 (BR-46).
-- Hand-written instead of Prisma's generated drop+create: RequesterUser is renamed IN PLACE so
-- every existing Ticket.requesterId keeps pointing at the same person. No rows are copied or lost.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMIN');

-- Rename the table and its Prisma-named objects so the result is identical to a fresh "User" table.
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "RequesterUser_id_seq" RENAME TO "User_id_seq";

-- New columns (BR-46a): added nullable / with a temporary default on the populated table,
-- back-filled, then made NOT NULL. Nothing is inserted with a default that Prisma does not own.
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- BR-46: migrated Lab 2 requesters receive a per-row *unprovisioned* credential — a sentinel that
-- the scrypt verifier can never match — so nobody (including someone who read the docs) can sign
-- into a migrated account until an Administrator sets an initial password (BR-44). This keeps
-- BR-04 (unique salt per hash) intact: no shared or precomputed hash is written.
UPDATE "User" SET "passwordHash" = 'unprovisioned$' || gen_random_uuid()::text WHERE "passwordHash" IS NULL;
UPDATE "User" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
