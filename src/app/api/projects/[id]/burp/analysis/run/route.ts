import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { processPendingSecretJobs } from '@/lib/burp-ai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/analysis/run — process pending AI analysis jobs
 * NOW (the ingest pipeline also processes a couple lazily; this flushes the
 * queue on demand from the Secrets tab).
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
    const limit = Math.min(20, Math.max(1, Number(body.limit) || 10));

    const result = await processPendingSecretJobs(id, limit);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/analysis/run]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
