import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/pairing — generate a one-time pairing code the
 * Burp extension exchanges for the server URL + engagement key. Expires in
 * 10 minutes.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const project = await db.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const code = randomBytes(4).toString('hex').toUpperCase(); // 8 chars
    await db.$executeRawUnsafe(
      `INSERT INTO "BurpPairing" (id, "projectId", "codeHash", "expiresAt", "createdAt")
       VALUES ($1,$2,$3, CURRENT_TIMESTAMP + interval '10 minutes', CURRENT_TIMESTAMP)`,
      uuidv4(), id, createHash('sha256').update(code).digest('hex'),
    );

    return NextResponse.json({ success: true, code, expiresInMin: 10 });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/pairing]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
