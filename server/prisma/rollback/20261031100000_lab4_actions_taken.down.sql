-- Rollback for migration 20261031100000_lab4_actions_taken (docs/lab-04/specification.md §7).
-- Drops exactly the objects that migration created; every Lab 3 table, column, and row is left
-- untouched. Lab 4 data (Actions Taken, status history, version, resolvedAt) is lost, so take a
-- pg_dump first. After running it against a database, tell Prisma the migration is gone:
--   npx prisma migrate resolve --rolled-back 20261031100000_lab4_actions_taken
-- Tested by MIG-05 (server/tests/lab-04/migration.api.test.ts): up, down, up.

DROP TABLE IF EXISTS "TicketStatusHistory";

DROP TABLE IF EXISTS "ActionTaken";

DROP TYPE IF EXISTS "ActionStatus";

DROP INDEX IF EXISTS "Ticket_updatedAt_idx";

DROP INDEX IF EXISTS "Ticket_resolvedAt_idx";

ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt", DROP COLUMN IF EXISTS "version";
