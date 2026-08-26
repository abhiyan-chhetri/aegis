import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { processIngestBatch } from '@/lib/burp-ingest';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/test-event — fires a synthetic request/response
 * pair through the SAME ingest pipeline the Burp extension uses (dedup,
 * anomaly flags, secret scan, endpoint upsert, broadcast). Lets the user
 * verify the whole Burp Bridge pipeline works without the extension.
 */
export async function POST(
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

    const ts = Date.now();
    const result = await processIngestBatch(project.id, project, [
      {
        method: 'GET',
        url: `https://bridge-test.invalid/api/ping?probe=${ts}`,
        statusCode: 200,
        contentType: 'application/json',
        requestHeaders: { Host: 'bridge-test.invalid', 'User-Agent': 'Aegis-Bridge-Test' },
        requestBody: '',
        responseHeaders: { 'Content-Type': 'application/json', 'X-Aegis-Test': '1' },
        responseBody: JSON.stringify({
          ok: true,
          note: 'Aegis Burp Bridge test event — if you can see this in the Traffic tab, the pipeline works.',
          ts,
        }),
        tool: 'manual',
        timestamp: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({ ok: true, project: project.name, ...result });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/test-event]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
