import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson, AnomalyFlag } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/endpoints — normalized endpoint inventory.
 * Query: q (search), js=1 (JS assets only), flagged=1 (anomalies only).
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
    const q = sp.get('q') || '';
    const jsOnly = sp.get('js') === '1';
    const flaggedOnly = sp.get('flagged') === '1';

    const project = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const where: string[] = ['"projectId" = $1'];
    const paramsArr: unknown[] = [id];
    if (q) { paramsArr.push(q); where.push(`(path ILIKE '%' || $${paramsArr.length} || '%' OR host ILIKE '%' || $${paramsArr.length} || '%' OR method = $${paramsArr.length})`); }
    if (jsOnly) where.push(`"isJsAsset" = true`);
    if (flaggedOnly) where.push(`anomalies != '[]'`);

    const [countRows, rows] = await Promise.all([
      db.$queryRawUnsafe<Array<{ n: string }>>(`SELECT COUNT(*) AS n FROM "BurpEndpoint" WHERE ${where.join(' AND ')}`, ...paramsArr),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, method, host, path, "sampleUrl", "hitCount", "statusCodes",
                "firstSeenAt", "lastSeenAt", "isJsAsset", anomalies, "testedCount", "succeededCount"
         FROM "BurpEndpoint" WHERE ${where.join(' AND ')}
         ORDER BY "lastSeenAt" DESC LIMIT 500`,
        ...paramsArr,
      ),
    ]);

    const list = rows.map(r => ({
      ...r,
      statusCodes: safeJson<number[]>(String(r.statusCodes || '[]'), []),
      anomalies: safeJson<AnomalyFlag[]>(String(r.anomalies || '[]'), []),
      firstSeenAt: new Date(r.firstSeenAt as Date).toISOString(),
      lastSeenAt: new Date(r.lastSeenAt as Date).toISOString(),
    }));

    return NextResponse.json({ endpoints: list, total: Number(countRows[0]?.n || 0) });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/endpoints]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
