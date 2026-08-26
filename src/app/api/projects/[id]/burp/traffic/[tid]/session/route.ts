import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/traffic/:tid/session — mark/unmark this exchange
 * as the authenticated session anchor. Body: { isSession: boolean }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, tid } = await params;
    const body = await request.json().catch(() => ({}));
    const isSession = body.isSession === true;

    const rows = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "BurpTraffic" WHERE id = $1 AND "projectId" = $2`,
      tid, id,
    );
    if (!rows[0]) return NextResponse.json({ error: 'Traffic not found' }, { status: 404 });

    if (isSession) {
      // Only one session anchor per project.
      await db.$executeRawUnsafe(
        `UPDATE "BurpTraffic" SET "isSession" = false WHERE "projectId" = $1 AND "isSession" = true`,
        id,
      );
    }
    await db.$executeRawUnsafe(
      `UPDATE "BurpTraffic" SET "isSession" = $1 WHERE id = $2`,
      isSession, tid,
    );

    return NextResponse.json({ success: true, isSession });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/traffic/[tid]/session]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
