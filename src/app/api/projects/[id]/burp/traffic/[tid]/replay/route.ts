import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson } from '@/lib/burp';

export const dynamic = 'force-dynamic';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection',
  'te', 'trailer', 'content-length', 'accept-encoding', 'expect',
]);

/**
 * POST /api/projects/:id/burp/traffic/:tid/replay — one-click replay.
 * Re-sends the recorded request to the original target from the server.
 * If the target is NOT reachable from the Aegis host (e.g. it only resolves
 * from the tester's machine), the request is queued into the REPLAY POOL and
 * the Burp extension pulls it to fire from Burp (Repeater + auto-send).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, tid } = await params;
    const body = await request.json().catch(() => ({}));
    const useSession = body.useSession === true;

    const rows = await db.$queryRawUnsafe<Array<{
      method: string; url: string; "requestHeaders": string; "requestBody": string;
    }>>(
      `SELECT method, url, "requestHeaders", "requestBody" FROM "BurpTraffic"
       WHERE id = $1 AND "projectId" = $2 AND "scopeOk" = true`,
      tid, id,
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Traffic not found' }, { status: 404 });

    const headers = safeJson<Record<string, string>>(row.requestHeaders, {});
    const outHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const lk = k.toLowerCase();
      if (HOP_BY_HOP.has(lk) || lk.startsWith('x-') || lk === 'host') continue;
      outHeaders[k] = v;
    }

    // Session injection: apply the project's authenticated session anchor.
    if (useSession) {
      try {
        const sess = await db.$queryRawUnsafe<{ "requestHeaders": string }[]>(
          `SELECT "requestHeaders" FROM "BurpTraffic"
           WHERE "projectId" = $1 AND "isSession" = true AND "scopeOk" = true
           ORDER BY "updatedAt" DESC LIMIT 1`,
          id,
        );
        const sh = safeJson<Record<string, string>>(sess[0]?.requestHeaders, {});
        if (sh.cookie) outHeaders['Cookie'] = sh.cookie;
        if (sh.authorization) outHeaders['Authorization'] = sh.authorization;
      } catch { /* session optional */ }
    }

    const started = Date.now();
    try {
      const res = await fetch(row.url, {
        method: row.method,
        headers: outHeaders,
        body: row.requestBody || undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      const bodyBuf = await res.arrayBuffer();
      const body = Buffer.from(bodyBuf).toString('utf8');
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { respHeaders[k] = v; });
      return NextResponse.json({
        ok: true,
        statusCode: res.status,
        durationMs: Date.now() - started,
        responseHeaders: respHeaders,
        responseBody: body.slice(0, 50_000) + (body.length > 50_000 ? '\n…[truncated]' : ''),
      });
    } catch (e) {
      // ── Queue for Burp replay: the extension pulls it and fires from the
      //    tester's machine (which CAN reach the target). ─────────────────────
      const taskId = uuidv4();
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO "BurpReplayTask"
             (id, "projectId", "trafficId", method, url, "requestHeaders", "requestBody", status, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
          taskId, id, tid, row.method, row.url, row.requestHeaders, row.requestBody || '',
        );
        return NextResponse.json({
          ok: false,
          queued: true,
          taskId,
          error: 'Target not reachable from the Aegis server — queued for Burp replay. The extension will pull it and open it in Repeater.',
          durationMs: Date.now() - started,
        }, { status: 202 });
      } catch (qe) {
        console.error('[replay] queue failed:', qe);
        return NextResponse.json({
          ok: false,
          error: `Replay failed: ${e instanceof Error ? e.message : 'network error'} (and couldn't queue for Burp)`,
          durationMs: Date.now() - started,
        }, { status: 502 });
      }
    }
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/traffic/[tid]/replay]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
