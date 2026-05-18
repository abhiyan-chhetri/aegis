/**
 * GET  /api/notifications            — list current user's notifications
 * PATCH /api/notifications           — { ids?: string[], read: boolean }
 *                                       mark a list (or all) as read/unread
 * DELETE /api/notifications?id=…     — remove a single notification
 *
 * Notifications cover three sources:
 *   - @mentions in finding comments
 *   - finding watchers (status, severity, comment, assignee changes)
 *   - SLA alerts (breaching-soon, overdue) — populated by the dashboard job
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const onlyUnread = url.searchParams.get('unread') === '1';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);

  const rows = await db.$queryRawUnsafe<{
    id: string; type: string; title: string; body: string; link: string;
    actorId: string | null; actorName: string | null;
    findingId: string | null; read: boolean; createdAt: Date;
  }[]>(
    `SELECT n.id, n.type, n.title, n.body, n.link, n."actorId",
            u.name AS "actorName",
            n."findingId", n.read, n."createdAt"
     FROM "Notification" n
     LEFT JOIN "User" u ON u.id = n."actorId"
     WHERE n."userId" = $1 ${onlyUnread ? 'AND n.read = false' : ''}
     ORDER BY n."createdAt" DESC
     LIMIT ${limit}`,
    session.id,
  ).catch(() => [] as never[]);

  const unreadCount = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "Notification" WHERE "userId" = $1 AND read = false`,
    session.id,
  ).then(r => Number(r[0]?.count ?? 0)).catch(() => 0);

  return NextResponse.json({ notifications: rows, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { ids?: string[]; read?: boolean; all?: boolean };
  const read = body.read !== false; // default true

  if (body.all) {
    await db.$executeRawUnsafe(
      `UPDATE "Notification" SET read = $2 WHERE "userId" = $1`,
      session.id, read,
    );
    return NextResponse.json({ ok: true });
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids[] required (or set all=true)' }, { status: 400 });
  }
  const placeholders = body.ids.map((_, i) => `$${i + 3}`).join(',');
  await db.$executeRawUnsafe(
    `UPDATE "Notification" SET read = $2 WHERE "userId" = $1 AND id IN (${placeholders})`,
    session.id, read, ...body.ids,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await db.$executeRawUnsafe(
    `DELETE FROM "Notification" WHERE id = $1 AND "userId" = $2`,
    id, session.id,
  );
  return NextResponse.json({ ok: true });
}
