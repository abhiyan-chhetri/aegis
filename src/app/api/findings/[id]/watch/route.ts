/**
 * Toggle the current user's subscription on a finding.
 *
 * POST   /api/findings/:id/watch  → subscribe
 * DELETE /api/findings/:id/watch  → unsubscribe
 * GET    /api/findings/:id/watch  → { watching, count, watchers: [{id,name,initials}] }
 *
 * Subscribers are notified on status, severity, assignee and comment changes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

async function context(id: string, userId: string) {
  const rows = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "FindingWatcher" WHERE "findingId" = $1`, id,
  ).catch(() => [] as never[]);
  const meRows = await db.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS(SELECT 1 FROM "FindingWatcher" WHERE "findingId" = $1 AND "userId" = $2) AS exists`,
    id, userId,
  ).catch(() => [] as never[]);
  // Who is watching (for the roster popover in the finding editor).
  const watcherRows = await db.$queryRawUnsafe<{ id: string; name: string; initials: string }[]>(
    `SELECT u.id, u.name, u.initials
     FROM "FindingWatcher" w JOIN "User" u ON u.id = w."userId"
     WHERE w."findingId" = $1 ORDER BY w."createdAt" ASC`,
    id,
  ).catch(() => [] as never[]);
  return {
    count: Number(rows[0]?.count ?? 0),
    watching: !!meRows[0]?.exists,
    watchers: watcherRows,
  };
}

export async function GET(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await context(id, session.id));
}

export async function POST(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await db.$executeRawUnsafe(
    `INSERT INTO "FindingWatcher" ("findingId", "userId", "createdAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT DO NOTHING`,
    id, session.id,
  );
  return NextResponse.json(await context(id, session.id));
}

export async function DELETE(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await db.$executeRawUnsafe(
    `DELETE FROM "FindingWatcher" WHERE "findingId" = $1 AND "userId" = $2`,
    id, session.id,
  );
  return NextResponse.json(await context(id, session.id));
}
