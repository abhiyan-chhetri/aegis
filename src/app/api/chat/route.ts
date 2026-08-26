/**
 * Chat conversations — private to the creating user (no cross-user visibility).
 *
 * GET  /api/chat       → list my conversations (newest first)
 * POST /api/chat       → create a conversation
 *      { title?, kind?: 'general'|'finding', findingId? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

interface ChatRow {
  id: string;
  kind: string;
  title: string;
  findingId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  cost: number;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const findingId = request.nextUrl.searchParams.get('findingId');
  const chats = findingId
    ? await db.$queryRawUnsafe<ChatRow[]>(
        `SELECT c.id, c.kind, c.title, c."findingId", c."createdAt", c."updatedAt",
                (SELECT COUNT(*) FROM "ChatMessage" m WHERE m."chatId" = c.id)::int AS "messageCount",
                (SELECT COALESCE(SUM(m.cost),0) FROM "ChatMessage" m WHERE m."chatId" = c.id) AS cost
         FROM "Chat" c
         WHERE c."userId" = $1 AND c.kind = 'finding' AND c."findingId" = $2
         ORDER BY c."updatedAt" DESC`,
        session.id, findingId,
      ).catch(() => [])
    : await db.$queryRawUnsafe<ChatRow[]>(
        `SELECT c.id, c.kind, c.title, c."findingId", c."createdAt", c."updatedAt",
                (SELECT COUNT(*) FROM "ChatMessage" m WHERE m."chatId" = c.id)::int AS "messageCount",
                (SELECT COALESCE(SUM(m.cost),0) FROM "ChatMessage" m WHERE m."chatId" = c.id) AS cost
         FROM "Chat" c
         WHERE c."userId" = $1
         ORDER BY c."updatedAt" DESC`,
        session.id,
      ).catch(() => []);
  return NextResponse.json({ chats });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const kind: string = body.kind === 'finding' ? 'finding' : 'general';
  const findingId: string | null = body.findingId ? String(body.findingId) : null;
  const title: string = body.title ? String(body.title).slice(0, 120) : (kind === 'finding' ? 'Finding chat' : 'New chat');

  try {
    if (kind === 'finding' && findingId) {
      // The finding must exist (users are internal; chats are still private).
      const f = await db.finding.findUnique({ where: { id: findingId }, select: { id: true } });
      if (!f) return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    const id = uuidv4();
    await db.$executeRawUnsafe(
      `INSERT INTO "Chat" (id, "userId", "findingId", kind, title, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      id, session.id, findingId, kind, title,
    );
    return NextResponse.json({ chat: { id, kind, title, findingId, createdAt: new Date().toISOString() } }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/chat]', err);
    return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
  }
}
