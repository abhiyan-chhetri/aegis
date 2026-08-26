import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { findMatchingTraffic } from '@/lib/burp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/burp/match — given free text (notes, finding title, prompt), find
 * the top matching endpoints + sample request/response pairs so the UI can
 * offer them ("add these to the AI prompt?").
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const projectId = String(body.projectId || '');
    const text = String(body.text || '');
    const limit = Math.min(12, Math.max(1, Number(body.limit) || 8));

    if (!projectId || !text.trim()) {
      return NextResponse.json({ matches: [] });
    }

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const matches = await findMatchingTraffic(projectId, text, { limit, samplesPerMatch: 3 });
    return NextResponse.json({ matches });
  } catch (error) {
    console.error('[POST /api/burp/match]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
