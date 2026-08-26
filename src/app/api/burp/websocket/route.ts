import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { broadcast } from '@/lib/broadcaster';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 200;
const MAX_CONTENT = 50_000;

/**
 * POST /api/burp/websocket — WebSocket message ingest from the Burp extension.
 * Auth: `x-engagement-key` (same key as the HTTP traffic endpoint).
 * Body: { events: [{ host, url, direction: 'sent'|'received', content, tool, timestamp }] }
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

    const body = await request.json().catch(() => null);
    if (body?.ping === true) return NextResponse.json({ ok: true, pong: true });
    const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];
    if (events.length === 0) return NextResponse.json({ error: 'events[] is required' }, { status: 400 });

    let accepted = 0;
    const ids: string[] = [];
    for (const raw of events) {
      const host = String(raw.host || '').slice(0, 255);
      const url = String(raw.url || '').slice(0, 2000);
      const direction = raw.direction === 'received' ? 'received' : 'sent';
      const content = String(raw.content || '').slice(0, MAX_CONTENT);
      const tool = String(raw.tool || 'proxy').slice(0, 20);
      if (!host && !url) continue;
      const createdAt = raw.timestamp && !isNaN(Date.parse(raw.timestamp)) ? new Date(raw.timestamp) : new Date();
      const id = uuidv4();
      await db.$executeRawUnsafe(
        `INSERT INTO "BurpWebSocketMessage" (id, "projectId", host, url, direction, content, tool, "createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        id, key.projectId, host, url, direction, content, tool, createdAt,
      );
      accepted++;
      ids.push(id);
    }

    db.engagementKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    if (ids.length > 0) {
      broadcast(`burp:${key.projectId}`, { type: 'websocket', count: ids.length, ts: Date.now() });
    }

    return NextResponse.json({ ok: true, accepted, projectId: key.projectId });
  } catch (error) {
    console.error('[POST /api/burp/websocket]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 400 });
  }
}
