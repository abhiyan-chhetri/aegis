import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/websocket — captured WebSocket messages.
 * Query: limit (default 200), direction=sent|received, host.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(1000, Math.max(1, Number(sp.get('limit')) || 200));
    const direction = sp.get('direction') || '';
    const host = sp.get('host') || '';

    const where: string[] = ['"projectId" = $1'];
    const paramsArr: unknown[] = [id];
    if (direction === 'sent' || direction === 'received') { paramsArr.push(direction); where.push(`direction = $${paramsArr.length}`); }
    if (host) { paramsArr.push(host); where.push(`host ILIKE '%' || $${paramsArr.length} || '%'`); }

    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, host, url, direction, content, tool, "createdAt"
       FROM "BurpWebSocketMessage" WHERE ${where.join(' AND ')}
       ORDER BY "createdAt" DESC LIMIT ${limit}`,
      ...paramsArr,
    );

    return NextResponse.json({
      messages: rows.map(r => ({ ...r, createdAt: new Date(r.createdAt as Date).toISOString() })),
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/websocket]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
