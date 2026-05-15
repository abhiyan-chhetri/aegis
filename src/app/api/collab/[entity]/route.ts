/**
 * SSE stream endpoint — clients connect here to receive real-time updates.
 *
 * GET /api/collab/notes:PROJECT_ID   → notes collaboration channel
 * GET /api/collab/finding:FINDING_ID → finding field-edit channel
 *
 * Also handles typing-state POST (who is editing which field right now).
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { broadcaster } from '@/lib/broadcaster';

export const dynamic = 'force-dynamic';

// ── Typing state store (in-memory, keyed by channel:userId) ──────────────────
interface TypingState {
  userId: string;
  userName: string;
  userColor: string;
  field: string | null;
  /** Optional caret line number for multi-cursor awareness in editors */
  line?: number;
  ts: number;
}
const typingStates = new Map<string, TypingState>(); // key = `${channel}:${userId}`

const USER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#a855f7',
];

function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0xffffffff;
  return USER_COLORS[Math.abs(h) % USER_COLORS.length];
}

function getActiveTypers(channel: string, excludeUserId: string): TypingState[] {
  const now = Date.now();
  const result: TypingState[] = [];
  for (const [key, state] of typingStates.entries()) {
    if (!key.startsWith(`${channel}:`)) continue;
    if (state.userId === excludeUserId) continue;
    if (now - state.ts > 4000) continue; // expired
    result.push(state);
  }
  return result;
}

// ── SSE stream (GET) ──────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { entity } = await params;
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client gone */ }
      };

      // Subscribe to the channel
      broadcaster.on(entity, send);

      // Heartbeat keeps the connection alive through proxies
      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(': hb\n\n')); }
        catch { clearInterval(hb); }
      }, 20_000);

      cleanup = () => {
        broadcaster.off(entity, send);
        clearInterval(hb);
        // Clear this user's typing state
        typingStates.delete(`${entity}:${session.id}`);
        // Broadcast that this user stopped typing
        broadcaster.emit(entity, {
          type: 'typing',
          userId: session.id,
          userName: session.name,
          userColor: colorForUser(session.id),
          field: null,
        });
        try { controller.close(); } catch { /* already closed */ }
      };

      // Send initial connected event + current typers
      send({
        type: 'connected',
        userId: session.id,
        typers: getActiveTypers(entity, session.id),
      });
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

// ── Typing state update (POST) ────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { entity } = await params;
  const body = await request.json().catch(() => ({}));
  const field: string | null = body.field ?? null;
  const line: number | undefined = typeof body.line === 'number' ? body.line : undefined;

  const state: TypingState = {
    userId: session.id,
    userName: session.name || 'Someone',
    userColor: colorForUser(session.id),
    field,
    line,
    ts: Date.now(),
  };

  typingStates.set(`${entity}:${session.id}`, state);

  // Broadcast typing state to other subscribers
  broadcaster.emit(entity, { type: 'typing', ...state });

  return new Response('ok');
}
