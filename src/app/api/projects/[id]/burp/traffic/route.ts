import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson, AnomalyFlag } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/traffic — list captured traffic.
 * Query: host, tool, status, q (url/path search), anomaly=1, findingId, page, pageSize.
 * Bodies excluded unless detail=1.
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
    const host = sp.get('host') || '';
    const tool = sp.get('tool') || '';
    const status = sp.get('status') || '';
    const q = sp.get('q') || '';
    const anomalyOnly = sp.get('anomaly') === '1';
    const findingId = sp.get('findingId') || '';
    const rejectedOnly = sp.get('rejected') === '1';
    // Searching inside request/response BODIES is opt-in: with thousands of
    // captured rows, an ILIKE over every body means scanning many MB of text.
    // Default search only touches url / path / host, which are pg_trgm-indexed.
    const inBodies = sp.get('inBodies') === '1';
    const detail = sp.get('detail') === '1';
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize')) || 50));

    const project = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const where: string[] = ['"projectId" = $1'];
    // Scope-guard rejections are hidden by default (shown with rejected=1).
    if (!rejectedOnly) where.push(`"scopeOk" = true`);
    const paramsArr: unknown[] = [id];
    if (host) { paramsArr.push(host); where.push(`host ILIKE '%' || $${paramsArr.length} || '%'`); }
    if (tool) { paramsArr.push(tool); where.push(`tool = $${paramsArr.length}`); }
    if (status) { paramsArr.push(Number(status)); where.push(`"statusCode" = $${paramsArr.length}`); }
    if (findingId) { paramsArr.push(findingId); where.push(`"findingId" = $${paramsArr.length}`); }
    if (anomalyOnly) where.push(`anomalies != '[]'`);
    if (q) {
      paramsArr.push(q);
      // Indexed fast path (pg_trgm on url / pathNoQuery).
      where.push(`(url ILIKE '%' || $${paramsArr.length} || '%' OR "pathNoQuery" ILIKE '%' || $${paramsArr.length} || '%' OR host ILIKE '%' || $${paramsArr.length} || '%')`);
      if (inBodies) {
        paramsArr.push(q);
        where.push(`("requestBody" ILIKE '%' || $${paramsArr.length} || '%' OR "responseBody" ILIKE '%' || $${paramsArr.length} || '%')`);
      }
    }
    const whereSql = where.join(' AND ');

    const [countRows, rows] = await Promise.all([
      db.$queryRawUnsafe<Array<{ n: string }>>(`SELECT COUNT(*) AS n FROM "BurpTraffic" WHERE ${whereSql}`, ...paramsArr),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, method, url, host, "pathNoQuery", query, "statusCode", "contentType", tool,
                "sizeBytes", truncated, anomalies, secrets, "findingId", "createdAt"
         ${detail ? `, "requestHeaders", "requestBody", "responseHeaders", "responseBody"` : ''}
         FROM "BurpTraffic" WHERE ${whereSql}
         ORDER BY "createdAt" DESC LIMIT $${paramsArr.length + 1} OFFSET $${paramsArr.length + 2}`,
        ...paramsArr, pageSize, (page - 1) * pageSize,
      ),
    ]);

    const list = rows.map(r => ({
      ...r,
      anomalies: safeJson<AnomalyFlag[]>(String(r.anomalies || '[]'), []),
      secrets: safeJson(String(r.secrets || '[]'), []),
      createdAt: new Date(r.createdAt as Date).toISOString(),
    }));

    return NextResponse.json({
      traffic: list,
      total: Number(countRows[0]?.n || 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/traffic]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
