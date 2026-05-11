import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

// In-memory presence store (per-process; fine for single-instance deployment)
// { [entityKey]: { [userId]: { name, initials, ts } } }
const store: Record<string, Record<string, { name: string; initials: string; ts: number }>> = {};
const TTL_MS = 25_000; // 25 s — clients heartbeat every 15 s

function gc() {
  const now = Date.now();
  for (const key of Object.keys(store)) {
    for (const uid of Object.keys(store[key])) {
      if (now - store[key][uid].ts > TTL_MS) delete store[key][uid];
    }
    if (Object.keys(store[key]).length === 0) delete store[key];
  }
}

// POST /api/presence  body: { entity: "project:xyz" | "finding:abc" }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entity } = await req.json();
  if (!entity || typeof entity !== 'string')
    return NextResponse.json({ error: 'entity required' }, { status: 400 });

  gc();
  if (!store[entity]) store[entity] = {};
  store[entity][session.id] = {
    name: session.name,
    initials: (session.initials || session.name?.slice(0, 2) || '??').toUpperCase(),
    ts: Date.now(),
  };

  const others = Object.entries(store[entity])
    .filter(([uid]) => uid !== session.id)
    .map(([, v]) => ({ name: v.name, initials: v.initials }));

  return NextResponse.json({ others });
}

// DELETE /api/presence  body: { entity }
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true });

  const { entity } = await req.json().catch(() => ({}));
  if (entity && store[entity]) delete store[entity][session.id];

  return NextResponse.json({ ok: true });
}
