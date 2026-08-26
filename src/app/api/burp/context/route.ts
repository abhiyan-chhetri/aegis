import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { processIngestBatch } from '@/lib/burp-ingest';
import type { BurpTrafficEvent } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/burp/context — used by the Burp extension's context menu
 * ("Send to Aegis"). Body: { events: BurpTrafficEvent[], action: 'pin'|'flag' }
 * Ingests the selected request/response pair(s) and optionally pins them.
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
    const events: BurpTrafficEvent[] = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
    if (events.length === 0) return NextResponse.json({ error: 'events[] required' }, { status: 400 });
    const action = body.action === 'flag' ? 'flag' : 'pin';

    const project = await db.project.findUnique({
      where: { id: key.projectId },
      select: { id: true, burpScope: true, burpRetentionDays: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const result = await processIngestBatch(project.id, project, events);
    db.engagementKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    // The pairs stream into the project's Traffic tab live (drag to the rail
    // from there). Key-auth can't attribute a pin to a user, so no pin here.
    return NextResponse.json({ ok: true, ...result, note: 'sent to traffic — drag to the Interesting rail to pin' });
  } catch (error) {
    console.error('[POST /api/burp/context]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 400 });
  }
}
