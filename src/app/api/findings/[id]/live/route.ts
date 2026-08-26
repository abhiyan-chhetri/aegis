/**
 * Real-time collaboration channel for a single finding.
 *
 * GET  /api/findings/:id/live  → SSE stream
 *      Events:
 *        connected — self userId + full live-doc snapshot + roster
 *        roster    — who is present (join/leave/ping)
 *        doc       — a field value changed live (author + rev)
 *        cursor    — remote caret position (field + offset), or field:null on leave
 *        field_update — a committed save happened (from PATCH route)
 *      Heartbeat comment every 15s keeps proxies from killing the stream.
 *
 * POST /api/findings/:id/live  → send an update
 *      { type:'edit',   field, value }                → last-write-wins live edit
 *      { type:'cursor', field, offset|null }          → caret position
 *      { type:'ping',   field|null }                  → presence heartbeat
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { broadcaster } from '@/lib/broadcaster';
import {
  getDoc, applyEdit, setPresence, clearPresence, setCursor,
  getRoster, LIVE_FIELDS, colorForUser, getCursorSnapshot,
} from '@/lib/live-finding';

export const dynamic = 'force-dynamic';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// ── SSE stream ───────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { id: findingId } = await params;

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  // Register presence before opening the stream so the connected snapshot is complete.
  const roster = setPresence(findingId, {
    id: session.id, name: session.name || 'Someone', initials: initialsOf(session.name || 'Someone'),
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { /* client gone */ }
      };

      // Forward channel events (doc/cursor/field_update from saves).
      // Subscribed AFTER the connected handshake below so the browser always
      // receives `connected` first — the client's self-filter depends on it.
      const onChannel = (data: unknown) => send(data);

      cleanup = () => {
        broadcaster.off(`finding:${findingId}`, onChannel);
        clearInterval(hb);
        const remaining = clearPresence(findingId, session.id);
        setCursor(findingId, session.id, null, { name: session.name || '', color: colorForUser(session.id) });
        broadcaster.emit(`finding:${findingId}`, {
          type: 'roster',
          users: remaining.map(u => ({ id: u.id, name: u.name, initials: u.initials, color: u.color, field: u.field })),
        });
        try { controller.close(); } catch { /* already closed */ }
      };

      // Initial snapshot: doc + roster + everyone's current caret positions,
      // so a freshly-loaded/reloaded client renders all remote carets
      // immediately instead of waiting for their next keystroke.
      try {
        const doc = await getDoc(findingId);
        send({
          type: 'connected',
          userId: session.id,
          doc: {
            rev: doc.rev,
            fields: Object.fromEntries(
              Object.entries(doc.fields).map(([k, f]) => [k, { value: f.value, rev: f.rev }]),
            ),
          },
          roster: roster.map(u => ({ id: u.id, name: u.name, initials: u.initials, color: u.color, field: u.field })),
          cursors: getCursorSnapshot(findingId),
        });
      } catch (err) {
        console.warn('[live] snapshot failed', err);
        send({ type: 'connected', userId: session.id, doc: null, roster: [], cursors: {} });
      }

      // Now subscribe to live events (after connected is sent).
      broadcaster.on(`finding:${findingId}`, onChannel);

      // Tell everyone we joined.
      broadcaster.emit(`finding:${findingId}`, {
        type: 'roster',
        users: getRoster(findingId).map(u => ({ id: u.id, name: u.name, initials: u.initials, color: u.color, field: u.field })),
      });

      // Heartbeat keeps the connection alive through proxies.
      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(': hb\n\n')); }
        catch { clearInterval(hb); }
      }, 15_000);
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

// ── Client → server updates ──────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { id: findingId } = await params;

  const body = await request.json().catch(() => ({}));
  const type = body.type as string;

  if (type === 'edit') {
    const field = String(body.field || '');
    if (!LIVE_FIELDS.includes(field as (typeof LIVE_FIELDS)[number])) {
      return Response.json({ ok: false, error: 'unknown field' }, { status: 400 });
    }
    const value = typeof body.value === 'string' ? body.value : String(body.value ?? '');
    // Also refresh presence so a typing user stays "here".
    setPresence(findingId, {
      id: session.id, name: session.name || 'Someone', initials: initialsOf(session.name || 'Someone'), field,
    });
    const { rev } = await applyEdit(findingId, field, value, {
      id: session.id, name: session.name || 'Someone', color: colorForUser(session.id),
    });
    return Response.json({ ok: true, rev });
  }

  if (type === 'cursor') {
    const field = body.field == null ? null : String(body.field);
    const offset = typeof body.offset === 'number' ? body.offset : 0;
    setCursor(findingId, session.id, field === null ? null : { field, offset }, {
      name: session.name || 'Someone', color: colorForUser(session.id),
    });
    return Response.json({ ok: true });
  }

  if (type === 'ping') {
    const field = body.field == null ? null : String(body.field);
    setPresence(findingId, {
      id: session.id, name: session.name || 'Someone', initials: initialsOf(session.name || 'Someone'), field,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: 'unknown type' }, { status: 400 });
}
