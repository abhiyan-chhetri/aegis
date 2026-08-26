import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getAIConfig } from '@/lib/ai-config';
import { generateBypassSuggestions, BurpTrafficPayload } from '@/lib/ai';
import { loadTrafficForAI, normalizePath } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/checklist/:itemId/bypass
 * The tester marked a technique "failed" — the AI reads the actual captured
 * traffic for that endpoint and proposes concrete bypass approaches.
 * Returns { markdown, suggestions } — suggestions can be added as child items.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, itemId } = await params;

    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ci.*, e.method AS "epMethod", e.host AS "epHost", e.path AS "epPath", e."sampleUrl" AS "epSampleUrl"
       FROM "BurpChecklistItem" ci
       LEFT JOIN "BurpEndpoint" e ON e.id = ci."endpointId"
       WHERE ci.id = $1 AND ci."projectId" = $2`,
      itemId, id,
    );
    const item = rows[0];
    if (!item) return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });

    // Recent traffic for this endpoint (esp. the failed attempt).
    let traffic: BurpTrafficPayload[] = [];
    if (item.endpointId && item.epMethod && item.epHost) {
      const trafficRows = await db.$queryRawUnsafe<{ id: string; "pathNoQuery": string }[]>(
        `SELECT id, "pathNoQuery" FROM "BurpTraffic"
         WHERE "projectId" = $1 AND host = $2 AND method = $3
         ORDER BY "createdAt" DESC LIMIT 30`,
        id, String(item.epHost), String(item.epMethod),
      );
      const wantPath = String(item.epPath || '');
      const matched = trafficRows.filter(r => normalizePath(r.pathNoQuery) === wantPath).map(r => r.id);
      traffic = await loadTrafficForAI(id, matched.length > 0 ? matched : trafficRows.slice(0, 3).map(r => r.id));
    }

    const config = await getAIConfig();
    config.usageUserId = session.id;
    config.usageFeature = 'burp-bypass';

    const result = await generateBypassSuggestions(config, {
      category: String(item.category || 'api'),
      technique: String(item.technique || ''),
      payload: String(item.payload || ''),
      description: String(item.description || ''),
      resultNote: String(item.resultNote || ''),
      endpoint: item.endpointId ? {
        method: String(item.epMethod || ''),
        host: String(item.epHost || ''),
        path: String(item.epPath || ''),
        sampleUrl: String(item.epSampleUrl || ''),
      } : undefined,
      traffic,
    });

    return NextResponse.json({
      markdown: result.markdown,
      suggestions: result.suggestions,
      item: {
        id: item.id,
        category: item.category,
        technique: item.technique,
        endpointId: item.endpointId ?? null,
      },
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/checklist/[itemId]/bypass]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
