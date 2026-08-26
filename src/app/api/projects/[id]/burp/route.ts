import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp — Burp Bridge settings + live stats.
 * PATCH — update burpScope / burpRetentionDays.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, burpScope: true, burpRetentionDays: true, burpCaptureRules: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const keys = await db.engagementKey.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, keyPrefix: true, label: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });

    const [stats, endpoints, checklist, rejectedHosts, replayPendingRows] = await Promise.all([
      db.$queryRawUnsafe<Array<{ total: string; today: string; anomalies: string; secrets: string; lastIngest: Date | null; outOfScope: string }>>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_DATE) AS today,
                COUNT(*) FILTER (WHERE anomalies != '[]') AS anomalies,
                COUNT(*) FILTER (WHERE secrets != '[]') AS secrets,
                MAX("createdAt") AS "lastIngest",
                COUNT(*) FILTER (WHERE NOT "scopeOk") AS "outOfScope"
         FROM "BurpTraffic" WHERE "projectId" = $1`,
        id,
      ),
      db.$queryRawUnsafe<Array<{ total: string; js: string; flagged: string }>>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE "isJsAsset") AS js,
                COUNT(*) FILTER (WHERE anomalies != '[]') AS flagged
         FROM "BurpEndpoint" WHERE "projectId" = $1`,
        id,
      ),
      db.$queryRawUnsafe<Array<{ untested: string; tested: string; succeeded: string; failed: string }>>(
        `SELECT COUNT(*) FILTER (WHERE status = 'untested') AS untested,
                COUNT(*) FILTER (WHERE status = 'tested') AS tested,
                COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed
         FROM "BurpChecklistItem" WHERE "projectId" = $1`,
        id,
      ),
      db.$queryRawUnsafe<Array<{ host: string; n: string; lastSeen: Date }>>(
        `SELECT host, COUNT(*) AS n, MAX("createdAt") AS "lastSeen"
         FROM "BurpTraffic" WHERE "projectId" = $1 AND NOT "scopeOk"
         GROUP BY host ORDER BY n DESC LIMIT 50`,
        id,
      ),
      db.$queryRawUnsafe<Array<{ n: string }>>(
        `SELECT COUNT(*) AS n FROM "BurpReplayTask" WHERE "projectId" = $1 AND status = 'pending'`,
        id,
      ),
    ]);

    const s = stats[0] ?? {};
    const e = endpoints[0] ?? {};
    const c = checklist[0] ?? {};
    const r = replayPendingRows[0] ?? {};

    return NextResponse.json({
      settings: {
        burpScope: project.burpScope || '',
        burpRetentionDays: project.burpRetentionDays || 90,
        burpCaptureRules: (() => { try { return JSON.parse(project.burpCaptureRules || '{}'); } catch { return {}; } })(),
      },
      keys: keys.map(k => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        label: k.label,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
        createdAt: k.createdAt.toISOString(),
      })),
      stats: {
        trafficTotal: Number(s.total || 0),
        trafficToday: Number(s.today || 0),
        anomalyTraffic: Number(s.anomalies || 0),
        secretTraffic: Number(s.secrets || 0),
        outOfScope: Number(s.outOfScope || 0),
        lastIngest: s.lastIngest ? new Date(s.lastIngest).toISOString() : null,
        endpoints: Number(e.total || 0),
        jsAssets: Number(e.js || 0),
        flaggedEndpoints: Number(e.flagged || 0),
        pendingReplays: Number(r.n || 0),
        checklist: {
          untested: Number(c.untested || 0),
          tested: Number(c.tested || 0),
          succeeded: Number(c.succeeded || 0),
          failed: Number(c.failed || 0),
        },
      },
      // Scope sync-back: hosts the extension forwarded that the scope guard
      // rejected — offer these as "add to scope guard?" suggestions.
      rejectedHosts: rejectedHosts.map(r => ({
        host: r.host,
        count: Number(r.n || 0),
        lastSeen: new Date(r.lastSeen).toISOString(),
      })),
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const data: { burpScope?: string; burpRetentionDays?: number; burpCaptureRules?: string } = {};
    if (typeof body.burpScope === 'string') data.burpScope = body.burpScope.slice(0, 4000);
    if (body.burpRetentionDays !== undefined) {
      const d = Math.max(1, Math.min(3650, Number(body.burpRetentionDays) || 90));
      data.burpRetentionDays = d;
    }
    if (body.burpCaptureRules !== undefined && typeof body.burpCaptureRules === 'object') {
      data.burpCaptureRules = JSON.stringify({
        dropHosts: Array.isArray(body.burpCaptureRules.dropHosts) ? body.burpCaptureRules.dropHosts.map(String).slice(0, 200) : [],
        onlyTools: Array.isArray(body.burpCaptureRules.onlyTools) ? body.burpCaptureRules.onlyTools.map(String).slice(0, 20) : [],
        dropStatic: body.burpCaptureRules.dropStatic === true,
      });
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // Raw SQL update (column may not exist on very old DBs until migration runs).
    const sets: string[] = [];
    const paramsArr: unknown[] = [];
    if (data.burpScope !== undefined) { paramsArr.push(data.burpScope); sets.push(`"burpScope" = $${paramsArr.length}`); }
    if (data.burpRetentionDays !== undefined) { paramsArr.push(data.burpRetentionDays); sets.push(`"burpRetentionDays" = $${paramsArr.length}`); }
    if (data.burpCaptureRules !== undefined) { paramsArr.push(data.burpCaptureRules); sets.push(`"burpCaptureRules" = $${paramsArr.length}`); }
    paramsArr.push(id);
    await db.$executeRawUnsafe(`UPDATE "Project" SET ${sets.join(', ')} WHERE id = $${paramsArr.length}`, ...paramsArr);

    return NextResponse.json({ success: true, settings: data });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]/burp]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
