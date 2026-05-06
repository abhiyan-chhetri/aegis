import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

// In-memory presence tracking (per-instance)
// In production, use Redis for multi-instance support
const presence = new Map<string, Set<{ userId: string; userName: string; timestamp: number }>>();

const PRESENCE_TIMEOUT = 30000; // 30 seconds

// Cleanup stale entries
setInterval(() => {
  const now = Date.now();
  for (const [findingId, users] of presence.entries()) {
    const active = new Set(Array.from(users).filter(u => now - u.timestamp < PRESENCE_TIMEOUT));
    if (active.size === 0) {
      presence.delete(findingId);
    } else {
      presence.set(findingId, active);
    }
  }
}, 10000);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: findingId } = await params;
    const users = Array.from(presence.get(findingId) || [])
      .filter(u => u.userId !== session.id) // exclude self
      .map(u => ({ userId: u.userId, userName: u.userName }));

    return NextResponse.json({ viewing: users });
  } catch (error) {
    console.error('[GET /api/findings/[id]/presence]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: findingId } = await params;

    // Register presence
    if (!presence.has(findingId)) {
      presence.set(findingId, new Set());
    }
    const users = presence.get(findingId)!;

    // Remove old entry for this user if exists
    Array.from(users).forEach(u => {
      if (u.userId === session.id) users.delete(u);
    });

    // Add updated presence
    users.add({
      userId: session.id,
      userName: session.name || 'Unknown',
      timestamp: Date.now(),
    });

    // Return other viewing users
    const others = Array.from(users)
      .filter(u => u.userId !== session.id)
      .map(u => ({ userId: u.userId, userName: u.userName }));

    return NextResponse.json({ viewing: others, registered: true });
  } catch (error) {
    console.error('[POST /api/findings/[id]/presence]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
