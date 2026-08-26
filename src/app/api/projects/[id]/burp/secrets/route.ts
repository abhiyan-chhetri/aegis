import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { safeJson, SecretHit } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/secrets — aggregate every secret found across the
 * captured traffic (stored per row in BurpTraffic.secrets), deduped by
 * type+value, with the first-seen URL/context.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const typeFilter = (request.nextUrl.searchParams.get('type') || '').toLowerCase();

    const rows = await db.$queryRawUnsafe<Array<{
      secrets: string; url: string; method: string; host: string; "pathNoQuery": string; "createdAt": Date;
    }>>(
      `SELECT secrets, url, method, host, "pathNoQuery", "createdAt"
       FROM "BurpTraffic"
       WHERE "projectId" = $1 AND secrets != '[]' AND "scopeOk" = true
       ORDER BY "createdAt" DESC LIMIT 2000`,
      id,
    );

    const seen = new Set<string>();
    const secrets: Array<{
      type: string; value: string; context: string; source: string; confidence: string | null;
      url: string; method: string; host: string; path: string; createdAt: string; occurrences: number;
    }> = [];
    for (const r of rows) {
      const hits = safeJson<SecretHit[]>(r.secrets, []);
      for (const h of hits) {
        if (typeFilter && h.type.toLowerCase() !== typeFilter) continue;
        const key = `${h.type}\u0000${h.value}`;
        const existing = seen.has(key);
        seen.add(key);
        if (!existing) {
          secrets.push({
            type: h.type,
            value: h.value,
            context: h.context || '',
            source: h.source || 'regex',
            confidence: h.confidence || null,
            url: r.url,
            method: r.method,
            host: r.host,
            path: r.pathNoQuery,
            createdAt: new Date(r.createdAt).toISOString(),
            occurrences: 1,
          });
        } else {
          const s = secrets.find(x => `${x.type}\u0000${x.value}` === key);
          if (s) s.occurrences++;
        }
      }
    }

    // Severity hint per type
    const HIGH = new Set(['aws_access_key', 'google_api_key', 'github_token', 'slack_token', 'stripe_key', 'private_key', 'firebase_key', 'generic_api_key']);
    return NextResponse.json({
      secrets: secrets.map(s => ({ ...s, severity: HIGH.has(s.type) ? 'high' : 'info' })),
      types: [...new Set(secrets.map(s => s.type))].sort(),
      total: secrets.length,
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/secrets]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
