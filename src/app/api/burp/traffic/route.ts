import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { processIngestBatch } from '@/lib/burp-ingest';
import type { BurpTrafficEvent } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/burp/traffic — ingest endpoint called by the Burp extension.
 * Auth: `x-engagement-key: <secret>` (no session). The extension must only
 * forward in-scope traffic; the server enforces the declared scope again.
 *
 * Body: { events: BurpTrafficEvent[] } (max 200 per call).
 */
export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-engagement-key') || '';
    if (!secret) {
      return NextResponse.json({ error: 'Missing x-engagement-key header' }, { status: 401 });
    }
    const keyHash = createHash('sha256').update(secret).digest('hex');

    const key = await db.engagementKey.findFirst({
      where: { keyHash, revokedAt: null },
      select: { id: true, projectId: true, label: true },
    });
    if (!key) {
      return NextResponse.json({ error: 'Invalid or revoked engagement key' }, { status: 401 });
    }

    const project = await db.project.findUnique({
      where: { id: key.projectId },
      select: { id: true, name: true, burpScope: true, burpRetentionDays: true, burpCaptureRules: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);

    // Connectivity ping for the Burp extension ("Test connection" button):
    // authenticates the key and returns pong without storing anything.
    if (body?.ping === true) {
      return NextResponse.json({ ok: true, pong: true, project: project.name });
    }

    const events: BurpTrafficEvent[] = Array.isArray(body?.events) ? body.events : [];
    if (events.length === 0) {
      return NextResponse.json({ error: 'events[] is required' }, { status: 400 });
    }

    // Stamp last-used for the key (non-blocking if it fails).
    db.engagementKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    const result = await processIngestBatch(project.id, project, events);

    return NextResponse.json({
      ok: true,
      project: project.name,
      ...result,
    });
  } catch (error) {
    console.error('[POST /api/burp/traffic]', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    const status = msg.includes('too large') ? 413 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
