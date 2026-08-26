import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson, AnomalyFlag } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/traffic/:tid/flag — add a manual anomaly flag.
 * Body: { type, label, severity }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, tid } = await params;
    const body = await request.json();
    const type = String(body.type || '').slice(0, 60);
    const label = String(body.label || type).slice(0, 200);
    const severity = ['low', 'medium', 'high', 'info'].includes(body.severity) ? body.severity : 'medium';
    if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });

    const rows = await db.$queryRawUnsafe<{ anomalies: string }[]>(
      `SELECT anomalies FROM "BurpTraffic" WHERE id = $1 AND "projectId" = $2`,
      tid, id,
    );
    if (!rows[0]) return NextResponse.json({ error: 'Traffic not found' }, { status: 404 });

    const flags = safeJson<AnomalyFlag[]>(rows[0].anomalies, []);
    if (!flags.some(f => f.type === type)) {
      flags.push({ type, label, severity });
      await db.$executeRawUnsafe(
        `UPDATE "BurpTraffic" SET anomalies = $1 WHERE id = $2`,
        JSON.stringify(flags), tid,
      );
    }

    return NextResponse.json({ success: true, anomalies: flags });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/traffic/[tid]/flag]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
