import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { runChecklistItems } from '@/lib/burp-runner';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/run — the payload runner (mini-Intruder).
 * Body: { items: [{ itemId?, payload?, endpointId? }], useSession?: bool }
 * Runs each payload against the endpoint's captured request, auto-detects
 * reflection / error / timing, and updates the checklist item status.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const project = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items.slice(0, 15) : [];
    if (items.length === 0) return NextResponse.json({ error: 'items[] required' }, { status: 400 });

    const results = await runChecklistItems(id, items, { useSession: body.useSession !== false });

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/run]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
