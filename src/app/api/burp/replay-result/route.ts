import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { broadcast } from '@/lib/broadcaster';

export const dynamic = 'force-dynamic';

/**
 * POST /api/burp/replay-result — the Burp extension reports back after firing
 * a pooled replay from the tester's machine. Body:
 * { taskId, statusCode?, headers?, body?, durationMs?, error? }
 */
export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-engagement-key') || '';
    if (!secret) return NextResponse.json({ error: 'Missing x-engagement-key header' }, { status: 401 });
    const keyHash = createHash('sha256').update(secret).digest('hex');
    const key = await db.engagementKey.findFirst({
      where: { keyHash, revokedAt: null },
      select: { id: true, projectId: true },
    });
    if (!key) return NextResponse.json({ error: 'Invalid or revoked engagement key' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const taskId = String(body.taskId || '');
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    const task = await db.$queryRawUnsafe<{ id: string; "projectId": string }[]>(
      `SELECT id, "projectId" FROM "BurpReplayTask" WHERE id = $1`,
      taskId,
    );
    if (!task[0] || task[0].projectId !== key.projectId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const status = body.error ? 'failed' : 'done';
    const result = {
      statusCode: Number(body.statusCode) || 0,
      headers: body.headers && typeof body.headers === 'object' ? body.headers : {},
      body: String(body.body || '').slice(0, 50_000),
      durationMs: Number(body.durationMs) || 0,
      error: body.error ? String(body.error).slice(0, 500) : '',
      replayedAt: new Date().toISOString(),
    };

    await db.$executeRawUnsafe(
      `UPDATE "BurpReplayTask" SET status = $1, result = $2, "sentVia" = 'burp', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
      status, JSON.stringify(result), taskId,
    );

    broadcast(`burp:${key.projectId}`, {
      type: 'replay-result',
      taskId,
      status,
      result,
      ts: Date.now(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/burp/replay-result]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
