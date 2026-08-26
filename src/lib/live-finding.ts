/**
 * Live-finding collaboration store — the server-side heart of the real-time
 * finding editor.
 *
 * Holds, per finding (in memory, keyed by finding id):
 *   • a live document (the shared field values + per-field revision counters),
 *     hydrated lazily from the DB on first access;
 *   • a presence roster (who is viewing/editing right now);
 *   • remote cursor positions (which field + caret offset).
 *
 * All updates fan out over the existing in-process `broadcaster` on the
 * `finding:{id}` channel so SSE subscribers receive them instantly. Like the
 * broadcaster, this store is per-instance: it works perfectly for the
 * single-server deployment this tool targets. Multi-instance deployments would
 * move this behind Redis (see broadcaster.ts for the same note).
 */
import { db } from './db';
import { broadcast } from './broadcaster';

// ── Types ────────────────────────────────────────────────────────────────────
export interface LiveField { value: string; rev: number; }
export interface LiveDoc { rev: number; fields: Record<string, LiveField>; }

export interface LiveUser {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** field key the user is currently editing, or null */
  field: string | null;
  ts: number;
}

export interface LiveCursor { field: string; offset: number; }

// Fields that participate in the live document. Key names must match the
// editor's field keys (long-form tabs lowercased + metadata + assets).
export const LIVE_FIELDS = [
  'title', 'summary', 'description', 'reproduction', 'impact', 'remediation',
  'references', 'cwe', 'owasp', 'severity', 'status', 'assets',
] as const;

// ── Singleton store (per process) ────────────────────────────────────────────
interface LiveStore {
  docs: Map<string, LiveDoc>;
  hydrating: Map<string, Promise<LiveDoc>>;
  roster: Map<string, Map<string, LiveUser>>;
  cursors: Map<string, Map<string, LiveCursor>>;
  cursorPending: Map<string, Map<string, LiveCursor>>; // debounced latest
  cursorTimers: Map<string, Map<string, ReturnType<typeof setTimeout>>>;
}

declare global {
  var __aegis_live_finding: LiveStore | undefined;
}

if (!global.__aegis_live_finding) {
  global.__aegis_live_finding = {
    docs: new Map(),
    hydrating: new Map(),
    roster: new Map(),
    cursors: new Map(),
    cursorPending: new Map(),
    cursorTimers: new Map(),
  };
}
const store = global.__aegis_live_finding;

// ── User colours (stable per user across the app) ────────────────────────────
const USER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#a855f7',
];
export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0xffffffff;
  return USER_COLORS[Math.abs(h) % USER_COLORS.length];
}

// ── Doc hydration from the DB (once per finding per process) ────────────────
async function hydrateDoc(findingId: string): Promise<LiveDoc> {
  const row = await db.finding.findUnique({
    where: { id: findingId },
    select: {
      title: true, summary: true, description: true, reproduction: true,
      impact: true, remediation: true, references: true, cwe: true, owasp: true,
      severity: true, status: true, assets: true,
    },
  });
  const fields: Record<string, LiveField> = {};
  let rev = 0;
  for (const f of LIVE_FIELDS) {
    let raw = row ? String((row as Record<string, unknown>)[f] ?? '') : '';
    if (f === 'assets' && raw) {
      try {
        const arr = JSON.parse(raw);
        raw = Array.isArray(arr) ? arr.join('\n') : raw;
      } catch { /* keep raw */ }
    }
    fields[f] = { value: raw, rev: rev++ };
  }
  return { rev, fields };
}

/** Get (or hydrate) the live doc for a finding. */
export function getDoc(findingId: string): Promise<LiveDoc> {
  const cached = store.docs.get(findingId);
  if (cached) return Promise.resolve(cached);

  let p = store.hydrating.get(findingId);
  if (!p) {
    p = hydrateDoc(findingId).then(doc => {
      store.docs.set(findingId, doc);
      store.hydrating.delete(findingId);
      return doc;
    });
    store.hydrating.set(findingId, p);
  }
  return p;
}

// ── Edits (last-write-wins per field; revs are monotonic for ordering) ──────
export async function applyEdit(
  findingId: string,
  field: string,
  value: string,
  author: { id: string; name: string; color: string },
): Promise<{ rev: number }> {
  const doc = await getDoc(findingId);
  const prev = doc.fields[field] ?? { value: '', rev: 0 };
  const rev = prev.rev + 1;
  doc.fields[field] = { value, rev };
  doc.rev += 1;
  broadcast(`finding:${findingId}`, {
    type: 'doc',
    field,
    value,
    rev,
    userId: author.id,
    userName: author.name,
    userColor: author.color,
    ts: Date.now(),
  });
  return { rev };
}

// ── Roster (presence) ────────────────────────────────────────────────────────
function rosterFor(findingId: string): Map<string, LiveUser> {
  let m = store.roster.get(findingId);
  if (!m) {
    m = new Map();
    store.roster.set(findingId, m);
  }
  return m;
}

export function getRoster(findingId: string): LiveUser[] {
  const now = Date.now();
  return Array.from(rosterFor(findingId).values())
    .filter(u => now - u.ts < 45_000);
}

export function setPresence(
  findingId: string,
  user: { id: string; name: string; initials: string; field?: string | null },
): LiveUser[] {
  const m = rosterFor(findingId);
  const prev = m.get(user.id);
  const next: LiveUser = {
    id: user.id,
    name: user.name,
    initials: user.initials || user.name.slice(0, 2).toUpperCase(),
    color: prev?.color ?? colorForUser(user.id),
    field: user.field !== undefined ? user.field : (prev?.field ?? null),
    ts: Date.now(),
  };
  m.set(user.id, next);
  return getRoster(findingId);
}

export function clearPresence(findingId: string, userId: string): LiveUser[] {
  const m = store.roster.get(findingId);
  m?.delete(userId);
  return getRoster(findingId);
}

// ── Cursors ──────────────────────────────────────────────────────────────────
const CURSOR_THROTTLE_MS = 70;

function cursorsFor(findingId: string): Map<string, LiveCursor> {
  let m = store.cursors.get(findingId);
  if (!m) {
    m = new Map();
    store.cursors.set(findingId, m);
  }
  return m;
}

export function setCursor(
  findingId: string,
  userId: string,
  cursor: LiveCursor | null,
  author: { name: string; color: string },
): void {
  const map = cursorsFor(findingId);
  if (cursor === null) {
    map.delete(userId);
    broadcast(`finding:${findingId}`, {
      type: 'cursor', userId, field: null, offset: 0, userName: author.name, userColor: author.color,
    });
    return;
  }
  map.set(userId, cursor);

  // Debounce the broadcast so a fast typist doesn't flood the SSE channel.
  let pending = store.cursorPending.get(findingId);
  if (!pending) {
    pending = new Map();
    store.cursorPending.set(findingId, pending);
  }
  pending.set(userId, cursor);

  let timers = store.cursorTimers.get(findingId);
  if (!timers) {
    timers = new Map();
    store.cursorTimers.set(findingId, timers);
  }
  if (timers.has(userId)) return;
  timers.set(userId, setTimeout(() => {
    timers.delete(userId);
    const latest = pending.get(userId);
    if (!latest) return;
    broadcast(`finding:${findingId}`, {
      type: 'cursor', userId, field: latest.field, offset: latest.offset,
      userName: author.name, userColor: author.color,
    });
  }, CURSOR_THROTTLE_MS));
}

export function getCursors(findingId: string): Record<string, LiveCursor> {
  return Object.fromEntries(cursorsFor(findingId).entries());
}

/**
 * Snapshot of current cursor positions (for the SSE `connected` handshake).
 * Includes the roster's name/colour so a freshly-reloaded client can render
 * everyone's carets immediately instead of waiting for their next keystroke.
 */
export function getCursorSnapshot(
  findingId: string,
): Record<string, LiveCursor & { userName: string; userColor: string }> {
  const users = getRoster(findingId);
  const byId = new Map(users.map(u => [u.id, u]));
  const out: Record<string, LiveCursor & { userName: string; userColor: string }> = {};
  for (const [uid, c] of cursorsFor(findingId).entries()) {
    const u = byId.get(uid);
    out[uid] = {
      field: c.field,
      offset: c.offset,
      userName: u?.name || '',
      userColor: u?.color ?? colorForUser(uid),
    };
  }
  return out;
}

// ── Roster expiry sweep ──────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [findingId, users] of store.roster.entries()) {
    let changed = false;
    for (const [uid, u] of users.entries()) {
      if (now - u.ts > 45_000) {
        users.delete(uid);
        store.cursors.get(findingId)?.delete(uid);
        changed = true;
      }
    }
    if (changed) {
      broadcast(`finding:${findingId}`, {
        type: 'roster',
        users: getRoster(findingId).map(u => ({
          id: u.id, name: u.name, initials: u.initials, color: u.color, field: u.field,
        })),
      });
    }
    if (users.size === 0) store.roster.delete(findingId);
  }
}, 20_000);
