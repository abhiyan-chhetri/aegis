/**
 * Idempotently ensure the v2.0 environmental columns exist on Project.
 *
 * The instrumentation hook adds these at server startup, but a `git pull`
 * without a server restart leaves the running process unaware of the new
 * columns. Routes that query them therefore crash with Postgres 42703
 * ("column does not exist").
 *
 * Calling `ensureEnvColumns()` at the top of any such route fixes that on
 * first hit: ALTER TABLE IF NOT EXISTS is a no-op when the column already
 * exists, so the cost is one trivial query per server lifetime.
 *
 * Module-scope cache: only runs once per process even with many concurrent
 * requests.
 */
import { db } from './db';

let ensured: Promise<void> | null = null;

export function ensureEnvColumns(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dataClassification" TEXT NOT NULL DEFAULT 'C3'`,
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "criticality" TEXT NOT NULL DEFAULT 'silver'`,
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "cvssLocked" BOOLEAN NOT NULL DEFAULT false`,
      );
      // v2.2 — engagement type drives SLA matrix
      await db.$executeRawUnsafe(
        `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementType" TEXT NOT NULL DEFAULT 'external'`,
      );
      // v2.2 — notifications + watcher tables
      await db.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "Notification" (
          id TEXT PRIMARY KEY,
          "userId"    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
          type        TEXT NOT NULL,
          title       TEXT NOT NULL DEFAULT '',
          body        TEXT NOT NULL DEFAULT '',
          link        TEXT NOT NULL DEFAULT '',
          "actorId"   TEXT REFERENCES "User"(id) ON DELETE SET NULL,
          "findingId" TEXT REFERENCES "Finding"(id) ON DELETE CASCADE,
          read        BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      );
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", read)`,
      );
      await db.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "FindingWatcher" (
          "findingId" TEXT NOT NULL REFERENCES "Finding"(id) ON DELETE CASCADE,
          "userId"    TEXT NOT NULL REFERENCES "User"(id)    ON DELETE CASCADE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY ("findingId", "userId")
        )`,
      );
      // v2.3 — Report Content additional sections
      await db.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "keySecurityStrengths"      TEXT NOT NULL DEFAULT ''`);
      await db.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "keyAreasForImprovement"    TEXT NOT NULL DEFAULT ''`);
      await db.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "immediateActions"          TEXT NOT NULL DEFAULT ''`);
      await db.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "shortTermImprovements"     TEXT NOT NULL DEFAULT ''`);
      await db.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "longTermRecommendations"   TEXT NOT NULL DEFAULT ''`);
    } catch (err) {
      console.warn('[ensureEnvColumns] warning:', (err as Error).message);
      // Reset so the next call retries
      ensured = null;
      throw err;
    }
  })();
  return ensured;
}
