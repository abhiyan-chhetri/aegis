'use client';

/**
 * useFindingLive — client side of the real-time finding collaboration channel.
 *
 * Connects an EventSource to /api/findings/:id/live and exposes:
 *   • the live doc snapshot + per-field revision counters
 *   • the presence roster (avatars + "X is editing Y")
 *   • remote cursor positions (field + caret offset)
 *   • pushEdit / pushCursor / setActiveField to broadcast your own activity
 *   • an onEvent subscription so the editor can apply remote field values
 *
 * All pushes are debounced/throttled client-side to keep the SSE channel quiet.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export interface RemoteUser {
  id: string;
  name: string;
  initials: string;
  color: string;
  field: string | null;
}
export interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  field: string;
  offset: number;
}
export interface LiveDocField { value: string; rev: number; }
export interface LiveDocSnapshot { rev: number; fields: Record<string, LiveDocField>; }

export type LiveEvent =
  | { type: 'doc'; field: string; value: string; rev: number; userId: string; userName: string; userColor: string }
  | { type: 'commit'; updatedAt: string; fields: Record<string, unknown> }
  | { type: 'snapshot'; doc: LiveDocSnapshot };

const EDIT_DEBOUNCE_MS = 280;   // coalesce typing bursts per field
const CURSOR_THROTTLE_MS = 120; // caret position while typing
const PING_MS = 15_000;

export function useFindingLive(findingId?: string, enabled = true) {
  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RemoteUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});

  const fieldRevs = useRef<Record<string, number>>({});
  const activeFieldRef = useRef<string | null>(null);
  const listeners = useRef<Set<(e: LiveEvent) => void>>(new Set());

  const editTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingEdits = useRef<Record<string, { value: string; rev: number }>>({});

  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCursor = useRef<{ field: string | null; offset: number } | null>(null);

  const connectedRef = useRef(false);

  // ── SSE connection ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!findingId || !enabled) return;
    connectedRef.current = false;
    const es = new EventSource(`/api/findings/${findingId}/live`);

    es.onmessage = (ev) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'connected': {
          connectedRef.current = true;
          setConnected(true);
          const myId = String(data.userId || '');
          setSelfId(myId);
          const doc = (data.doc || null) as LiveDocSnapshot | null;
          if (doc?.fields) {
            for (const [k, f] of Object.entries(doc.fields)) {
              fieldRevs.current[k] = f.rev;
            }
            listeners.current.forEach(l => l({ type: 'snapshot', doc }));
          }
          setRoster(Array.isArray(data.roster) ? data.roster as RemoteUser[] : []);
          // Restore everyone's current caret positions (so a reload shows the
          // carets immediately — no waiting for the next keystroke).
          if (data.cursors && typeof data.cursors === 'object') {
            const next: Record<string, RemoteCursor> = {};
            for (const [uid, c] of Object.entries(data.cursors as Record<string, {
              field: string; offset: number; userName?: string; userColor?: string;
            }>)) {
              if (uid === myId) continue;
              next[uid] = {
                userId: uid,
                name: c.userName || 'Someone',
                color: c.userColor || '#888',
                field: c.field,
                offset: c.offset,
              };
            }
            setCursors(next);
          }
          break;
        }
        case 'roster':
          setRoster(Array.isArray(data.users) ? data.users as RemoteUser[] : []);
          break;
        case 'doc': {
          const field = String(data.field || '');
          fieldRevs.current[field] = Number(data.rev ?? fieldRevs.current[field]);
          listeners.current.forEach(l => l({
            type: 'doc',
            field,
            value: String(data.value ?? ''),
            rev: Number(data.rev ?? 0),
            userId: String(data.userId || ''),
            userName: String(data.userName || 'Someone'),
            userColor: String(data.userColor || '#888'),
          }));
          break;
        }
        case 'cursor': {
          const uid = String(data.userId || '');
          if (uid === selfId) break; // ignore own echo
          if (data.field == null) {
            setCursors(prev => {
              if (!(uid in prev)) return prev;
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          } else {
            setCursors(prev => ({
              ...prev,
              [uid]: {
                userId: uid,
                name: String(data.userName || 'Someone'),
                color: String(data.userColor || '#888'),
                field: String(data.field),
                offset: Number(data.offset ?? 0),
              },
            }));
          }
          break;
        }
        case 'field_update': {
          // A committed save (from the PATCH route) — the editor applies it and
          // refreshes its save token.
          listeners.current.forEach(l => l({
            type: 'commit',
            updatedAt: String(data.updatedAt || ''),
            fields: (data.fields || {}) as Record<string, unknown>,
          }));
          break;
        }
      }
    };
    // EventSource auto-reconnects; reset the flag so we don't treat a reconnect
    // as a fresh connected event with the wrong self id.
    es.onerror = () => { setConnected(false); };

    return () => {
      es.close();
      setConnected(false);
      connectedRef.current = false;
      // Tell the server we left (fire-and-forget with keepalive).
      fetch(`/api/findings/${findingId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cursor', field: null, offset: 0 }),
        keepalive: true,
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingId, enabled]);

  // ── Presence heartbeat ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!findingId || !enabled) return;
    const ping = () => {
      fetch(`/api/findings/${findingId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ping', field: activeFieldRef.current }),
      }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, PING_MS);
    return () => clearInterval(t);
  }, [findingId, enabled]);

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const onEvent = useCallback((fn: (e: LiveEvent) => void) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  // ── Active field (the one the local user is editing right now) ────────────
  const setActiveField = useCallback((field: string | null) => {
    activeFieldRef.current = field;
  }, []);

  // ── Push a live edit (debounced per field) ─────────────────────────────────
  const pushEdit = useCallback((field: string, value: string) => {
    if (!findingId || !enabled || !connectedRef.current) return;
    pendingEdits.current[field] = { value, rev: fieldRevs.current[field] ?? 0 };
    if (editTimers.current[field]) return;
    editTimers.current[field] = setTimeout(() => {
      delete editTimers.current[field];
      const pending = pendingEdits.current[field];
      if (!pending) return;
      fetch(`/api/findings/${findingId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'edit', field, value: pending.value }),
      }).catch(() => {});
    }, EDIT_DEBOUNCE_MS);
  }, [findingId, enabled]);

  // ── Push a cursor position (throttled; field=null clears) ──────────────────
  const pushCursor = useCallback((field: string | null, offset?: number | null) => {
    if (!findingId || !enabled || !connectedRef.current) return;
    if (field === null) {
      // Flush immediately on blur.
      if (cursorTimer.current) { clearTimeout(cursorTimer.current); cursorTimer.current = null; }
      pendingCursor.current = null;
      fetch(`/api/findings/${findingId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cursor', field: null, offset: 0 }),
      }).catch(() => {});
      return;
    }
    pendingCursor.current = { field, offset: offset ?? 0 };
    if (cursorTimer.current) return;
    cursorTimer.current = setTimeout(() => {
      cursorTimer.current = null;
      const p = pendingCursor.current;
      pendingCursor.current = null;
      if (!p) return;
      fetch(`/api/findings/${findingId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cursor', field: p.field, offset: p.offset }),
      }).catch(() => {});
    }, CURSOR_THROTTLE_MS);
  }, [findingId, enabled]);

  return {
    connected,
    selfId,
    roster,
    cursors,
    fieldRevs,
    onEvent,
    pushEdit,
    pushCursor,
    setActiveField,
  };
}
