import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/burp/replay-pool — called by the Burp extension. Returns the oldest
 * pending replay tasks (full request data — headers & body are stored RAW so
 * cookies/auth survive replay). Auth: x-engagement-key.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = request.headers.get('x-engagement-key') || '';
    if (!secret) return NextResponse.json({ error: 'Missing x-engagement-key header' }, { status: 401 });
    const keyHash = createHash('sha256').update(secret).digest('hex');
    const key = await db.engagementKey.findFirst({
      where: { keyHash, revokedAt: null },
      select: { id: true, projectId: true },
    });
    if (!key) return NextResponse.json({ error: 'Invalid or revoked engagement key' }, { status: 401 });

    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 20));
    const tasks = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, "trafficId", method, url, "requestHeaders", "requestBody"
       FROM "BurpReplayTask"
       WHERE "projectId" = $1 AND status = 'pending'
       ORDER BY "createdAt" ASC LIMIT ${limit}`,
      key.projectId,
    );

    db.engagementKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    return NextResponse.json({
      projectId: key.projectId,
      tasks: tasks.map(t => ({
        id: t.id,
        trafficId: t.trafficId,
        method: t.method,
        url: t.url,
        requestHeaders: (() => { try { return JSON.parse(String(t.requestHeaders || '{}')); } catch { return {}; } })(),
        requestBody: t.requestBody || '',
      })),
    });
  } catch (error) {
    console.error('[GET /api/burp/replay-pool]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
