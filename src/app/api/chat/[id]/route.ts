/**
 * GET    /api/chat/:id → chat + messages (owner only)
 * PATCH  /api/chat/:id → rename (owner only)
 * DELETE /api/chat/:id → delete chat + messages (owner only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const chatRows = await db.$queryRawUnsafe<any[]>(
    `SELECT id, "userId", "findingId", kind, title, "createdAt", "updatedAt" FROM "Chat" WHERE id = $1 AND "userId" = $2`,
    id, session.id,
  ).catch(() => []);
  if (chatRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const chat = chatRows[0];

  const messages = await db.$queryRawUnsafe<any[]>(
    `SELECT id, role, content, "inputTokens", "outputTokens", cost, "createdAt"
     FROM "ChatMessage" WHERE "chatId" = $1 ORDER BY "createdAt" ASC`,
    id,
  ).catch(() => []);
  return NextResponse.json({ chat, messages });
}

export async function PATCH(
  request: NextRequest, { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const title = body.title ? String(body.title).slice(0, 120) : null;
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const res = await db.$executeRawUnsafe(
    `UPDATE "Chat" SET title = $1, "updatedAt" = NOW() WHERE id = $2 AND "userId" = $3`,
    title, id, session.id,
  ).catch(() => 0);
  if (res === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  // Messages cascade via FK.
  const res = await db.$executeRawUnsafe(
    `DELETE FROM "Chat" WHERE id = $1 AND "userId" = $2`,
    id, session.id,
  ).catch(() => 0);
  if (res === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
