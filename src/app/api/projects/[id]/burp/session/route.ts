import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/session — the current authenticated session anchor
 * (an exchange marked as the session), with its cookies/tokens.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, method, url, host, "pathNoQuery", "requestHeaders", "createdAt"
       FROM "BurpTraffic"
       WHERE "projectId" = $1 AND "isSession" = true AND "scopeOk" = true
       ORDER BY "createdAt" DESC LIMIT 1`,
      id,
    );
    const r = rows[0];
    if (!r) return NextResponse.json({ session: null });

    const headers = safeJson<Record<string, string>>(String(r.requestHeaders || '{}'), {});
    return NextResponse.json({
      session: {
        id: r.id,
        method: r.method,
        url: r.url,
        host: r.host,
        path: r.pathNoQuery,
        hasCookie: Boolean(headers.cookie),
        hasAuthorization: Boolean(headers.authorization),
        createdAt: new Date(r.createdAt as Date).toISOString(),
      },
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/session]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
