/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts, before handling any requests.
 * Used to apply idempotent schema migrations so the app self-heals
 * on both dev and production without requiring manual psql commands.
 */

export async function register() {
  // Only run in Node.js runtime (not Edge), and only when a real DB is configured
  if (process.env.NEXT_RUNTIME === 'edge') return;
  if (!process.env.DATABASE_URL) return;

  try {
    // Lazy import to avoid module resolution at build time
    const { db } = await import('@/lib/db');

    // All migrations are idempotent (IF NOT EXISTS) — safe to re-run
    const migrations: string[] = [
      `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "assetOwner" TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assetOwners" TEXT NOT NULL DEFAULT '[]'`,
      // Multi-engagement support: group related pentests under a target code
      `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "targetCode" TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "engagementYear" TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "previousEngagementId" TEXT DEFAULT NULL`,
      // Activity feed for findings (status changes, edits, comments)
      `CREATE TABLE IF NOT EXISTS "Activity" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "findingId" TEXT REFERENCES "Finding"(id) ON DELETE CASCADE,
        "projectId" TEXT REFERENCES "Project"(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        badge TEXT NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS "Activity_findingId_idx" ON "Activity"("findingId")`,
      `CREATE INDEX IF NOT EXISTS "Activity_projectId_idx" ON "Activity"("projectId")`,
      // Comments on findings with @mentions
      `CREATE TABLE IF NOT EXISTS "FindingComment" (
        id TEXT PRIMARY KEY,
        "findingId" TEXT NOT NULL REFERENCES "Finding"(id) ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        mentions TEXT NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS "FindingComment_findingId_idx" ON "FindingComment"("findingId")`,
    ];

    for (const sql of migrations) {
      await db.$executeRawUnsafe(sql);
    }

    console.log('[aegis] Schema migrations applied ✓');
  } catch (err) {
    // Log but don't crash — the app may still work if columns already exist
    console.warn('[aegis] Migration warning:', (err as Error).message ?? err);
  }
}
