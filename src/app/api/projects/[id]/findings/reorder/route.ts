/**
 * POST /api/projects/[id]/findings/reorder
 * Body: { orderedIds: string[] }
 *
 * Persists drag-and-drop ordering by writing the sortOrder column for each
 * finding in the supplied order. Only updates findings that actually belong
 * to the project in question — safe against tampering.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

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

  // Single bulk UPDATE per finding — small numbers (typical ~5-30 per project),
  // so just issue them in parallel rather than building a CASE expression.
  await Promise.all(
    orderedIds.map((findingId, index) =>
      db.$executeRawUnsafe(
        `UPDATE "Finding" SET "sortOrder" = $1 WHERE id = $2 AND "projectId" = $3`,
        index,
        findingId,
        projectId,
      ),
    ),
  );

  return NextResponse.json({ ok: true });
}
