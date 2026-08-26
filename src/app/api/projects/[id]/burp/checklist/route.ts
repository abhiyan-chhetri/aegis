import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/checklist — checklist items (status/category filters).
 * POST — manually add items: { items: [{category, technique, description, payload, endpointId?, parentId?}] }.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const sp = request.nextUrl.searchParams;
    const status = sp.get('status') || '';
    const category = sp.get('category') || '';
    const endpointId = sp.get('endpointId') || '';

    const where: string[] = ['ci."projectId" = $1'];
    const paramsArr: unknown[] = [id];
    if (status) { paramsArr.push(status); where.push(`ci.status = $${paramsArr.length}`); }
    if (category) { paramsArr.push(category); where.push(`ci.category = $${paramsArr.length}`); }
    if (endpointId) { paramsArr.push(endpointId); where.push(`ci."endpointId" = $${paramsArr.length}`); }

    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ci.id, ci."endpointId", ci."parentId", ci.category, ci.technique, ci.description,
              ci.payload, ci.status, ci."resultNote", ci.source, ci."autoMarkedBy", ci."order",
              ci."createdAt", ci."updatedAt",
              e.method AS "epMethod", e.host AS "epHost", e.path AS "epPath", e."sampleUrl" AS "epSampleUrl"
       FROM "BurpChecklistItem" ci
       LEFT JOIN "BurpEndpoint" e ON e.id = ci."endpointId"
       WHERE ${where.join(' AND ')}
       ORDER BY ci."order" ASC, ci."createdAt" DESC LIMIT 2000`,
      ...paramsArr,
    );

    const items = rows.map(r => ({
      ...r,
      createdAt: new Date(r.createdAt as Date).toISOString(),
      updatedAt: new Date(r.updatedAt as Date).toISOString(),
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('[GET /api/projects/[id]/burp/checklist]', error);
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
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (items.length === 0) return NextResponse.json({ error: 'items[] is required' }, { status: 400 });

    const existing = await db.$queryRawUnsafe<{ technique: string; category: string; "endpointId": string | null }[]>(
      `SELECT technique, category, "endpointId" FROM "BurpChecklistItem" WHERE "projectId" = $1`,
      id,
    );
    const dupKey = new Set(existing.map(e => `${e.category}\u0000${e.technique}\u0000${e.endpointId || ''}`));

    const created: string[] = [];
    let order = 0;
    for (const raw of items) {
      const category = String(raw.category || 'api').slice(0, 60);
      const technique = String(raw.technique || '').trim().slice(0, 200);
      if (!technique) continue;
      const endpointId = raw.endpointId ? String(raw.endpointId) : null;
      const parentId = raw.parentId ? String(raw.parentId) : null;
      const key = `${category}\u0000${technique}\u0000${endpointId || ''}`;
      if (dupKey.has(key)) continue;
      dupKey.add(key);

      // Verify parent belongs to this project if provided
      if (parentId) {
        const p = await db.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "BurpChecklistItem" WHERE id = $1 AND "projectId" = $2`,
          parentId, id,
        );
        if (!p[0]) continue;
      }

      const newId = uuidv4();
      await db.$executeRawUnsafe(
        `INSERT INTO "BurpChecklistItem"
           (id, "projectId", "endpointId", "parentId", category, technique, description, payload,
            status, source, "order", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'untested',$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        newId, id, endpointId, parentId, category, technique,
        String(raw.description || '').slice(0, 2000),
        String(raw.payload || '').slice(0, 4000),
        String(raw.source || 'manual').slice(0, 20),
        order++,
      );
      created.push(newId);
    }

    return NextResponse.json({ created: created.length, ids: created });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/checklist]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
