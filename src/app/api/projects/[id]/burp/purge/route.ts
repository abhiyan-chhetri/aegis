import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { purgeProjectBurpData } from '@/lib/burp-purge';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/purge — manually clear ALL Burp Bridge data for
 * the project (traffic, endpoints, checklist, WebSockets, pins, keys). The
 * extension loses access immediately; there is no undo.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const counts = await purgeProjectBurpData(id);

    // Audit trail
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "Activity" (id, "projectId", "userId", action, target, detail, badge, "createdAt")
         VALUES ($1,$2,$3,'purge','Burp Bridge data',$4,'manual',CURRENT_TIMESTAMP)`,
        uuidv4(), id, session.id,
        JSON.stringify(counts),
      );
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, purged: counts });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/purge]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
