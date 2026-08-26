import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { broadcaster } from '@/lib/broadcaster';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/burp/stream — live Burp activity stream (SSE).
 * Pushes every new ingested traffic event on the `burp:{projectId}` channel.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return new Response('Project not found', { status: 404 });

  const channel = `burp:${id}`;
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { /* client gone */ }
      };

      // Connected-first: clients must receive `connected` before channel events
      // so their initial fetch can't race the subscription.
      send({ type: 'connected', ts: Date.now() });

      broadcaster.on(channel, send);
      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(': hb\n\n')); }
        catch { clearInterval(hb); }
      }, 20_000);

      cleanup = () => {
        broadcaster.off(channel, send);
        clearInterval(hb);
        try { controller.close(); } catch { /* already closed */ }
      };
    },
    cancel() { cleanup?.(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
