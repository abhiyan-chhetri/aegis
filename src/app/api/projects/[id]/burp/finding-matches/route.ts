import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { normalizePath } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/finding-matches?findingId=…
 * Finding ↔ traffic auto-link: rank captured endpoints by token overlap with
 * the finding's title/description/assets, and return the top traffic samples.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const findingId = request.nextUrl.searchParams.get('findingId') || '';
    const limit = Math.min(8, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 5));

    const f = await db.finding.findUnique({
      where: { id: findingId },
      select: { id: true, projectId: true, title: true, description: true, assets: true },
    });
    if (!f || f.projectId !== id) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });

    const text = [f.title, f.description || ''].join(' ').toLowerCase();
    const words = new Set<string>();
    for (const m of text.matchAll(/[a-z0-9][a-z0-9_\-./:?&=]{2,}/g)) {
      for (const part of m[0].split(/[\/?&=.#-]/)) {
        if (part.length >= 3 && part.length <= 40 && !/^\d+$/.test(part)) words.add(part);
      }
    }
    const assetHosts = (() => {
      try {
        return JSON.parse(f.assets || '[]').map((a: string) => String(a).match(/^([a-z0-9.-]+)/i)?.[1]?.toLowerCase()).filter(Boolean);
      } catch { return []; }
    })();

    const endpoints = await db.$queryRawUnsafe<Array<{ id: string; method: string; host: string; path: string; "hitCount": number }>>(
      `SELECT id, method, host, path, "hitCount" FROM "BurpEndpoint"
       WHERE "projectId" = $1 AND "hitCount" > 0 ORDER BY "lastSeenAt" DESC LIMIT 3000`,
      id,
    );

    const scored = endpoints
      .map(ep => {
        let score = 0;
        const matched: string[] = [];
        for (const seg of ep.path.split('/')) {
          if (seg === ':id' || seg === ':hex' || seg === ':token' || seg.length < 3) continue;
          if (words.has(seg)) { score += seg.length >= 8 ? 12 : 7; matched.push(seg); }
        }
        if (assetHosts.includes(ep.host.toLowerCase())) { score += 20; matched.push(ep.host); }
        if (text.includes(ep.path.replace(/:[a-z]+/g, '').toLowerCase())) score += 25;
        return { ep, score, matched };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const matches = [];
    for (const { ep, score, matched } of scored) {
      const samples = await db.$queryRawUnsafe<Array<{ id: string; method: string; url: string; "pathNoQuery": string; "statusCode": number; tool: string; "createdAt": Date }>>(
        `SELECT id, method, url, "pathNoQuery", "statusCode", tool, "createdAt" FROM "BurpTraffic"
         WHERE "projectId" = $1 AND host = $2 AND method = $3 AND "scopeOk" = true
         ORDER BY "createdAt" DESC LIMIT 30`,
        id, ep.host, ep.method,
      );
      const sample = samples.find(s => normalizePath(s.pathNoQuery) === ep.path) ?? samples[0];
      if (!sample) continue;
      matches.push({
        endpoint: { id: ep.id, method: ep.method, host: ep.host, path: ep.path, hitCount: ep.hitCount },
        score,
        matched,
        trafficId: sample.id,
        url: sample.url,
        statusCode: sample.statusCode,
        tool: sample.tool,
        createdAt: new Date(sample.createdAt).toISOString(),
      });
    }

    return NextResponse.json({ matches });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/finding-matches]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
