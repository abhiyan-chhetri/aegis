import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/pins — the "interesting rail". Pins reference
 * either a traffic row OR a checklist item (drag both onto the rail).
 * POST — pin: { trafficId? , checklistItemId?, note? }.
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
      `SELECT p.id, p."trafficId", p."checklistItemId", p.note, p."createdAt", u.name AS "userName",
              t.method AS "epMethod", t.url AS "epUrl", t."statusCode" AS "epStatus",
              t.tool AS "epTool", t.host AS "epHost", t."pathNoQuery" AS "epPath",
              t."createdAt" AS "epCreatedAt", t.anomalies AS "epAnomalies",
              ci.category AS "clCategory", ci.technique AS "clTechnique", ci.status AS "clStatus",
              ci.description AS "clDescription", ci.payload AS "clPayload",
              e.host AS "clHost", e.path AS "clPath", e.method AS "clMethod"
       FROM "BurpPin" p
       LEFT JOIN "BurpTraffic" t ON t.id = p."trafficId"
       LEFT JOIN "BurpChecklistItem" ci ON ci.id = p."checklistItemId"
       LEFT JOIN "BurpEndpoint" e ON e.id = ci."endpointId"
       LEFT JOIN "User" u ON u.id = p."userId"
       WHERE p."projectId" = $1
       ORDER BY p."createdAt" DESC LIMIT 200`,
      id,
    );

    return NextResponse.json({
      pins: rows.map(r => ({
        id: r.id,
        trafficId: r.trafficId,
        checklistItemId: r.checklistItemId,
        note: r.note,
        userName: r.userName,
        createdAt: new Date(r.createdAt as Date).toISOString(),
        traffic: r.trafficId ? {
          method: r.epMethod,
          url: r.epUrl,
          statusCode: r.epStatus,
          tool: r.epTool,
          host: r.epHost,
          path: r.epPath,
          createdAt: r.epCreatedAt ? new Date(r.epCreatedAt as Date).toISOString() : null,
          anomalies: (() => { try { return JSON.parse(String(r.epAnomalies || '[]')); } catch { return []; } })(),
        } : null,
        checklistItem: r.checklistItemId ? {
          category: r.clCategory,
          technique: r.clTechnique,
          status: r.clStatus,
          description: r.clDescription,
          payload: r.clPayload,
          endpoint: r.clHost ? `${r.clMethod} ${r.clHost}${r.clPath}` : null,
        } : null,
      })),
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/pins]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const trafficId = body.trafficId ? String(body.trafficId) : null;
    const checklistItemId = body.checklistItemId ? String(body.checklistItemId) : null;
    const note = String(body.note || '').slice(0, 500);

    if (!trafficId && !checklistItemId) {
      return NextResponse.json({ error: 'Provide trafficId or checklistItemId' }, { status: 400 });
    }

    if (trafficId) {
      const t = await db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "BurpTraffic" WHERE id = $1 AND "projectId" = $2`,
        trafficId, id,
      );
      if (!t[0]) return NextResponse.json({ error: 'Traffic not found' }, { status: 404 });
    }
    if (checklistItemId) {
      const c = await db.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "BurpChecklistItem" WHERE id = $1 AND "projectId" = $2`,
        checklistItemId, id,
      );
      if (!c[0]) return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
    }

    const pinId = uuidv4();
    await db.$executeRawUnsafe(
      `INSERT INTO "BurpPin" (id, "projectId", "trafficId", "checklistItemId", "userId", note, "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`,
      pinId, id, trafficId, checklistItemId, session.id, note,
    );

    return NextResponse.json({ success: true, pin: { id: pinId, trafficId, checklistItemId, note } });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/pins]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
