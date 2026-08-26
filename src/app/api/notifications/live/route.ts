/**
 * Per-user real-time notification stream.
 *
 * GET /api/notifications/live → SSE
 *   connected — handshake
 *   notify    — a new notification landed ({ type, title, body, link })
 *
 * The sidebar subscribes here so the unread badge updates the instant a
 * watched finding changes or someone mentions you — no 30s polling delay.
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { broadcaster } from '@/lib/broadcaster';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const channel = `user:${session.id}`;
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { /* client gone */ }
      };

      const onNotify = (data: unknown) => send(data);
      broadcaster.on(channel, onNotify);

      cleanup = () => {
        broadcaster.off(channel, onNotify);
        clearInterval(hb);
        try { controller.close(); } catch { /* already closed */ }
      };

      send({ type: 'connected', userId: session.id });

      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(': hb\n\n')); }
        catch { clearInterval(hb); }
      }, 20_000);
    },
    cancel() { cleanup?.(); },
  });

  request.signal.addEventListener('abort', () => cleanup?.());

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
