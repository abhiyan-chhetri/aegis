import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/replay-tasks?trafficId=… — replay tasks for a
 * traffic row (or the whole project), with results from both the server and
 * the Burp extension.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const trafficId = request.nextUrl.searchParams.get('trafficId') || '';
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 20));

    const where: string[] = ['"projectId" = $1'];
    const paramsArr: unknown[] = [id];
    if (trafficId) { paramsArr.push(trafficId); where.push(`"trafficId" = $${paramsArr.length}`); }

    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, "trafficId", method, url, status, result, "sentVia", "createdAt", "updatedAt"
       FROM "BurpReplayTask" WHERE ${where.join(' AND ')}
       ORDER BY "createdAt" DESC LIMIT ${limit}`,
      ...paramsArr,
    );

    return NextResponse.json({
      tasks: rows.map(t => ({
        id: t.id,
        trafficId: t.trafficId,
        method: t.method,
        url: t.url,
        status: t.status,
        sentVia: t.sentVia,
        result: (() => { try { return JSON.parse(String(t.result || '{}')); } catch { return {}; } })(),
        createdAt: new Date(t.createdAt as Date).toISOString(),
        updatedAt: new Date(t.updatedAt as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/replay-tasks]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
