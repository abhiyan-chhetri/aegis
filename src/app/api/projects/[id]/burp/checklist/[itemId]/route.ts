import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_STATUS = ['untested', 'tested', 'succeeded', 'failed', 'blocked'];

/**
 * PATCH /api/projects/:id/burp/checklist/:itemId
 * Body: { status?, resultNote? } — updates status + keeps endpoint counters in sync.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, itemId } = await params;
    const body = await request.json();

    const rows = await db.$queryRawUnsafe<{ id: string; status: string; "endpointId": string | null }[]>(
      `SELECT id, status, "endpointId" FROM "BurpChecklistItem" WHERE id = $1 AND "projectId" = $2`,
      itemId, id,
    );
    const item = rows[0];
    if (!item) return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });

    const sets: string[] = [];
    const paramsArr: unknown[] = [];
    let newStatus: string | null = null;

    if (body.status !== undefined) {
      if (!VALID_STATUS.includes(body.status)) {
        return NextResponse.json({ error: `Invalid status (${VALID_STATUS.join(', ')})` }, { status: 400 });
      }
      newStatus = body.status;
      paramsArr.push(newStatus);
      sets.push(`status = $${paramsArr.length}`);
    }
    if (typeof body.resultNote === 'string') {
      paramsArr.push(body.resultNote.slice(0, 4000));
      sets.push(`"resultNote" = $${paramsArr.length}`);
    }
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    paramsArr.push(itemId);
    await db.$executeRawUnsafe(
      `UPDATE "BurpChecklistItem" SET ${sets.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${paramsArr.length}`,
      ...paramsArr,
    );

    // Keep endpoint tested/succeeded counters in sync.
    if (item.endpointId && newStatus) {
      const old = item.status;
      const deltaTested = (newStatus !== 'untested' ? 1 : 0) - (old !== 'untested' ? 1 : 0);
      const deltaSucceeded = (newStatus === 'succeeded' ? 1 : 0) - (old === 'succeeded' ? 1 : 0);
      if (deltaTested !== 0 || deltaSucceeded !== 0) {
        await db.$executeRawUnsafe(
          `UPDATE "BurpEndpoint" SET "testedCount" = GREATEST(0, "testedCount" + $1),
                  "succeededCount" = GREATEST(0, "succeededCount" + $2)
           WHERE id = $3`,
          deltaTested, deltaSucceeded, item.endpointId,
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]/burp/checklist/[itemId]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
