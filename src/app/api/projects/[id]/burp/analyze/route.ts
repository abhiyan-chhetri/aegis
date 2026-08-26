import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getAIConfig } from '@/lib/ai-config';
import { analyzeBurpTraffic, BurpTrafficPayload } from '@/lib/ai';
import { loadTrafficForAI, safeJson, AnomalyFlag } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/analyze
 * Body: { trafficIds?: string[], endpointIds?: string[], prompt?, findingsSummary? }
 * Runs the AI analyst over captured traffic + endpoint inventory.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const trafficIds = Array.isArray(body.trafficIds) ? (body.trafficIds as string[]).slice(0, 50) : [];
    const endpointIds = Array.isArray(body.endpointIds) ? (body.endpointIds as string[]).slice(0, 100) : [];

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, engagement: true, burpScope: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // ── Traffic (explicit selection, or recent if none) ──────────────────────
    let traffic: BurpTrafficPayload[] = [];
    if (trafficIds.length > 0) {
      traffic = await loadTrafficForAI(id, trafficIds);
    } else {
      const recent = await db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "BurpTraffic" WHERE "projectId" = $1 ORDER BY "createdAt" DESC LIMIT 25`,
        id,
      );
      traffic = await loadTrafficForAI(id, recent.map(r => r.id));
    }

    // ── Endpoints (explicit selection, or all) ───────────────────────────────
    const epRows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, method, host, path, "sampleUrl", "hitCount", "statusCodes", "isJsAsset", anomalies
       FROM "BurpEndpoint"
       WHERE "projectId" = $1 ${endpointIds.length > 0 ? 'AND id = ANY($2::text[])' : ''}
       ORDER BY "hitCount" DESC LIMIT 300`,
      ...(endpointIds.length > 0 ? [id, endpointIds] : [id]),
    );
    const endpoints = epRows.map(r => ({
      id: String(r.id),
      method: String(r.method),
      host: String(r.host),
      path: String(r.path),
      sampleUrl: String(r.sampleUrl || ''),
      hitCount: Number(r.hitCount || 0),
      statusCodes: safeJson<number[]>(String(r.statusCodes || '[]'), []),
      isJsAsset: Boolean(r.isJsAsset),
      anomalies: safeJson<AnomalyFlag[]>(String(r.anomalies || '[]'), []),
    }));

    const config = await getAIConfig();
    config.usageUserId = session.id;
    config.usageFeature = 'burp-analyze';

    const { content } = await analyzeBurpTraffic(config, {
      projectName: project.name,
      engagement: project.engagement,
      scope: project.burpScope || undefined,
      endpoints,
      traffic,
      findingsSummary: typeof body.findingsSummary === 'string' ? body.findingsSummary : undefined,
      userPrompt: typeof body.prompt === 'string' ? body.prompt : undefined,
    });

    return NextResponse.json({ content, analyzed: { traffic: traffic.length, endpoints: endpoints.length } });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/analyze]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
