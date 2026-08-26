import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson, AnomalyFlag } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/coverage — the coverage report:
 * endpoint testing matrix, checklist coverage by category, untouched
 * endpoints, and awareness of unresolved carry-over findings.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const projRow = await db.$queryRawUnsafe<{ id: string; name: string; "previousEngagementId": string | null }[]>(
      `SELECT id, name, "previousEngagementId" FROM "Project" WHERE id = $1`,
      id,
    );
    const project = projRow[0];
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const [epRows, catRows, statusRows] = await Promise.all([
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT method, host, path, "sampleUrl", "hitCount", "statusCodes", "isJsAsset", anomalies,
                "testedCount", "succeededCount", "lastSeenAt"
         FROM "BurpEndpoint" WHERE "projectId" = $1 ORDER BY "hitCount" DESC LIMIT 3000`,
        id,
      ),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT category,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status IN ('tested','succeeded')) AS tested,
                COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) FILTER (WHERE status = 'untested') AS untested
         FROM "BurpChecklistItem" WHERE "projectId" = $1 GROUP BY category ORDER BY total DESC`,
        id,
      ),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT COUNT(*) FILTER (WHERE status = 'untested') AS untested,
                COUNT(*) FILTER (WHERE status = 'tested') AS tested,
                COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) FILTER (WHERE status = 'blocked') AS blocked
         FROM "BurpChecklistItem" WHERE "projectId" = $1`,
        id,
      ),
    ]);

    const endpoints = epRows.map(e => ({
      method: String(e.method),
      host: String(e.host),
      path: String(e.path),
      sampleUrl: String(e.sampleUrl || ''),
      hitCount: Number(e.hitCount || 0),
      statusCodes: safeJson<number[]>(String(e.statusCodes || '[]'), []),
      isJsAsset: Boolean(e.isJsAsset),
      anomalies: safeJson<AnomalyFlag[]>(String(e.anomalies || '[]'), []),
      testedCount: Number(e.testedCount || 0),
      succeededCount: Number(e.succeededCount || 0),
      lastSeenAt: new Date(e.lastSeenAt as Date).toISOString(),
    }));

    const testedEps = endpoints.filter(e => e.testedCount > 0);
    const untestedEps = endpoints.filter(e => e.testedCount === 0);
    const coveragePct = endpoints.length > 0 ? Math.round((testedEps.length / endpoints.length) * 100) : 0;

    const categories = catRows.map(c => ({
      category: String(c.category),
      total: Number(c.total || 0),
      tested: Number(c.tested || 0),
      succeeded: Number(c.succeeded || 0),
      failed: Number(c.failed || 0),
      untested: Number(c.untested || 0),
    }));

    const s = statusRows[0] ?? {};

    // Carry-over awareness: unresolved findings from the previous engagement,
    // with a rough "any traffic observed since" signal by matching their
    // declared assets (hosts) against captured traffic.
    let carryover: Array<{ code: string; title: string; severity: string; trafficSince: number }> = [];
    if (project.previousEngagementId) {
      const cf = await db.$queryRawUnsafe<Array<{ code: string; title: string; severity: string; assets: string }>>(
        `SELECT code, title, severity, assets FROM "Finding"
         WHERE "projectId" = $1 AND status NOT IN ('resolved','accepted')
         ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
        project.previousEngagementId,
      );
      carryover = await Promise.all(cf.map(async f => {
        let host = '';
        try {
          const arr = JSON.parse(f.assets || '[]');
          const first = Array.isArray(arr) ? arr[0] : '';
          const m = String(first).match(/^([a-z0-9.-]+)/i);
          host = m ? m[1].toLowerCase() : '';
        } catch { /* ignore */ }
        let trafficSince = 0;
        if (host) {
          const t = await db.$queryRawUnsafe<Array<{ n: string }>>(
            `SELECT COUNT(*) AS n FROM "BurpTraffic" WHERE "projectId" = $1 AND host = $2 AND "scopeOk" = true`,
            id, host,
          );
          trafficSince = Number(t[0]?.n || 0);
        }
        return { code: f.code, title: f.title, severity: f.severity, trafficSince };
      }));
    }

    return NextResponse.json({
      summary: {
        endpoints: endpoints.length,
        testedEndpoints: testedEps.length,
        untestedEndpoints: untestedEps.length,
        coveragePct,
        checklistTotal: Number(s.untested || 0) + Number(s.tested || 0) + Number(s.succeeded || 0) + Number(s.failed || 0) + Number(s.blocked || 0),
        checklistTested: Number(s.tested || 0) + Number(s.succeeded || 0),
        checklistFailed: Number(s.failed || 0),
        checklistUntested: Number(s.untested || 0),
      },
      categories,
      untestedEndpoints: untestedEps.slice(0, 100),
      carryover,
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/coverage]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
