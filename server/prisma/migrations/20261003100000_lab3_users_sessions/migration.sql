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

-- New columns. passwordHash is added nullable, back-filled, then made NOT NULL.
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- BR-46: every migrated Lab 2 requester receives the documented local-lab initial password
-- "Welcome123!" (scrypt, N=16384 r=8 p=1, fixed salt for reproducibility) and must change it at
-- first login (mustChangePassword defaults to true above). isActive is preserved as-is.
UPDATE "User"
SET "passwordHash" = 'scrypt$16384$8$1$VG9rVGlja0lUTGFiM01pZw==$XPw4ksT2KxfbrLz2BSi7sKPj751q+TqR+VSuwJYicsmYtdR9+tCl6jLAnC75wcVFLqYcFTTbPiuy9pfcTo2oYA=='
WHERE "passwordHash" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
-- Prisma's @updatedAt is maintained by the client, not a DB default.
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

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
