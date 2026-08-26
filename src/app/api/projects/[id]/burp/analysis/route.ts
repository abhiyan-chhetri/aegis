import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/analysis — AI analysis jobs (JS deep-reads) with
 * their results. Also aggregates AI-found secrets across the project.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 50));

    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT j.id, j.kind, j.status, j.result, j.error, j."createdAt", j."updatedAt",
              t.url AS "trafficUrl", t.method AS "trafficMethod"
       FROM "BurpAnalysisJob" j
       LEFT JOIN "BurpTraffic" t ON t.id = j."trafficId"
       WHERE j."projectId" = $1
       ORDER BY j."createdAt" DESC LIMIT ${limit}`,
      id,
    );

    const jobs = rows.map(r => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      error: r.error,
      trafficUrl: r.trafficUrl,
      trafficMethod: r.trafficMethod,
      result: (() => { try { return JSON.parse(String(r.result || '{}')); } catch { return {}; } })(),
      createdAt: new Date(r.createdAt as Date).toISOString(),
      updatedAt: new Date(r.updatedAt as Date).toISOString(),
    }));

    const counts = await db.$queryRawUnsafe<Array<{ pending: string; done: string; failed: string; total: string }>>(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'done') AS done,
              COUNT(*) FILTER (WHERE status = 'failed') AS failed,
              COUNT(*) AS total
       FROM "BurpAnalysisJob" WHERE "projectId" = $1`,
      id,
    );

    const c = counts[0] ?? {};
    return NextResponse.json({
      jobs,
      counts: {
        pending: Number(c.pending || 0),
        done: Number(c.done || 0),
        failed: Number(c.failed || 0),
        total: Number(c.total || 0),
      },
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/analysis]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
