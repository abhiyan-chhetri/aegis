import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson, AnomalyFlag } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/traffic/:tid/flow — session/flow reconstruction.
 * Chains requests that share the same session fingerprint (the ingest pipeline
 * stores Cookie/Authorization values as a non-reversible [fp:…] hash, so flows
 * are linkable without exposing the raw token). Falls back to host activity
 * when no session token was captured.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, tid } = await params;
    const rows = await db.$queryRawUnsafe<Array<{
      id: string; host: string; method: string; url: string; "pathNoQuery": string;
      "statusCode": number; tool: string; "requestHeaders": string; "responseHeaders": string;
      "createdAt": Date; "findingId": string | null;
    }>>(
      `SELECT id, host, method, url, "pathNoQuery", "statusCode", tool, "requestHeaders",
              "responseHeaders", "createdAt", "findingId"
       FROM "BurpTraffic" WHERE id = $1 AND "projectId" = $2 AND "scopeOk" = true`,
      tid, id,
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Traffic not found' }, { status: 404 });

    // Extract session-identifying values from this exchange's RAW headers:
    // Cookie values, Authorization bearer tokens, Set-Cookie session ids.
    // Headers are stored un-redacted so flows chain on the real token.
    const reqHeaders = safeJson<Record<string, string>>(row.requestHeaders, {});
    const resHeaders = safeJson<Record<string, string>>(row.responseHeaders, {});
    const markers: string[] = [];
    const collect = (h: Record<string, string>, isRes: boolean) => {
      for (const [k, v] of Object.entries(h)) {
        const lk = k.toLowerCase();
        if (lk === 'cookie' || lk === 'set-cookie') {
          // Use a stable per-cookie VALUE as the marker (raw, but exact match).
          const parts = String(v).split(/;\s*/);
          for (const part of parts) {
            const m = part.match(/^([^=]+)=([^;]{6,})$/);
            if (m) markers.push(`${m[1].trim().toLowerCase()}=${m[2]}`);
          }
        } else if (lk === 'authorization') {
          const m = String(v).match(/^(Bearer|Basic|Token)\s+(.{8,})$/i);
          if (m) markers.push(`${m[1].toLowerCase()}=${m[2]}`);
        }
      }
    };
    collect(reqHeaders, false);
    collect(resHeaders, true);

    let mode = 'host';
    let flow: Array<Record<string, unknown>> = [];
    if (markers.length > 0) {
      // Session-linked: any exchange carrying one of the same raw markers.
      const like = markers.map(m => {
        const escaped = m.replace(/[%_\\]/g, ch => `\\${ch}`);
        return `("requestHeaders" LIKE '%${escaped}%' ESCAPE '\\' OR "responseHeaders" LIKE '%${escaped}%' ESCAPE '\\')`;
      }).join(' OR ');
      const frows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, method, url, "statusCode", tool, "createdAt", "findingId"
         FROM "BurpTraffic"
         WHERE "projectId" = $1 AND host = $2 AND "scopeOk" = true AND (${like})
         ORDER BY "createdAt" ASC LIMIT 200`,
        id, row.host,
      );
      if (frows.length > 0) {
        mode = 'session';
        flow = frows.map(f => ({ ...f, createdAt: new Date(f.createdAt as Date).toISOString() }));
      }
    }
    if (mode === 'host') {
      const hrows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, method, url, "statusCode", tool, "createdAt", "findingId"
         FROM "BurpTraffic"
         WHERE "projectId" = $1 AND host = $2 AND "scopeOk" = true
         ORDER BY "createdAt" ASC LIMIT 200`,
        id, row.host,
      );
      flow = hrows.map(f => ({ ...f, createdAt: new Date(f.createdAt as Date).toISOString() }));
    }

    return NextResponse.json({
      anchor: { id: row.id, method: row.method, url: row.url, createdAt: new Date(row.createdAt).toISOString() },
      mode,
      flow,
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/traffic/[tid]/flow]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
