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
    } catch (err) {
      console.warn('[ensureEnvColumns] warning:', (err as Error).message);
      // Reset so the next call retries
      ensured = null;
      throw err;
    }
  })();
  return ensured;
}
