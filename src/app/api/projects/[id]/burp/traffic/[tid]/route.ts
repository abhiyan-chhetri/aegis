import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson, AnomalyFlag, SecretHit } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/traffic/:tid — full traffic detail (bodies).
 * PATCH — link/unlink a finding: { findingId: <id> | null }.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, tid } = await params;
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "BurpTraffic" WHERE id = $1 AND "projectId" = $2`,
      tid, id,
    );
    if (!rows[0]) return NextResponse.json({ error: 'Traffic not found' }, { status: 404 });

    const r = rows[0];
    let finding = null;
    if (r.findingId) {
      finding = await db.finding.findUnique({
        where: { id: String(r.findingId) },
        select: { id: true, code: true, title: true, severity: true, status: true },
      });
    }

    return NextResponse.json({
      traffic: {
        ...r,
        anomalies: safeJson<AnomalyFlag[]>(String(r.anomalies || '[]'), []),
        secrets: safeJson<SecretHit[]>(String(r.secrets || '[]'), []),
        requestHeaders: safeJson<Record<string, string>>(String(r.requestHeaders || '{}'), {}),
        responseHeaders: safeJson<Record<string, string>>(String(r.responseHeaders || '{}'), {}),
        createdAt: new Date(r.createdAt as Date).toISOString(),
      },
      finding,
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/traffic/[tid]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, tid } = await params;
    const body = await request.json();
    const findingId = body.findingId === null ? null : String(body.findingId || '');

    const exists = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "BurpTraffic" WHERE id = $1 AND "projectId" = $2`,
      tid, id,
    );
    if (!exists[0]) return NextResponse.json({ error: 'Traffic not found' }, { status: 404 });

    if (findingId) {
      const f = await db.finding.findUnique({ where: { id: findingId }, select: { id: true, projectId: true } });
      if (!f) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
      if (f.projectId !== id) return NextResponse.json({ error: 'Finding belongs to a different project' }, { status: 400 });
    }

    await db.$executeRawUnsafe(
      `UPDATE "BurpTraffic" SET "findingId" = $1 WHERE id = $2`,
      findingId, tid,
    );

    return NextResponse.json({ success: true, findingId });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]/burp/traffic/[tid]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
