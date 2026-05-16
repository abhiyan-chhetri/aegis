/**
 * POST /api/projects/[id]/findings/reorder
 * Body: { orderedIds: string[] }
 *
 * Persists drag-and-drop ordering by writing the sortOrder column for each
 * finding in the supplied order. Only updates findings that actually belong
 * to the project in question — safe against tampering.
 *
 * Self-healing: if the sortOrder column doesn't exist yet (because the dev
 * pulled the new code but didn't restart the server / run fixdb.sh), the
 * route adds the column on first call and proceeds. Same idempotent SQL the
 * instrumentation hook runs at startup.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

async function ensureSortOrderColumn(): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 999999`,
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Finding_projectId_sortOrder_idx" ON "Finding"("projectId", "sortOrder")`,
    );
  } catch (err) {
    // Already exists or a transient error — fine. Re-thrown below if the
    // subsequent UPDATE also fails.
    console.warn('[reorder] ensureSortOrderColumn warning:', (err as Error).message);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const { orderedIds } = (await req.json().catch(() => ({}))) as { orderedIds?: string[] };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds[] is required' }, { status: 400 });
  }

  // Ensure the column exists before we write to it
  await ensureSortOrderColumn();

  try {
    // Run all updates in a transaction so partial failures don't leave a
    // half-reordered list behind.
    await db.$transaction(
      orderedIds.map((findingId, index) =>
        db.$executeRawUnsafe(
          `UPDATE "Finding" SET "sortOrder" = $1 WHERE id = $2 AND "projectId" = $3`,
          index,
          findingId,
          projectId,
        ),
      ),
    );
    return NextResponse.json({ ok: true, updated: orderedIds.length });
  } catch (err) {
    console.error('[reorder] update failed:', err);
    return NextResponse.json(
      { error: 'Failed to persist order', details: (err as Error).message },
      { status: 500 },
    );
  }
}
