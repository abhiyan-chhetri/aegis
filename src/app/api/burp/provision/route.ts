import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/burp/provision — pairing-code exchange for the extension.
 * Body: { code } — one-time code generated in Aegis (project → Burp → Settings).
 * Returns the server URL + a fresh engagement key, fully configuring the
 * extension without manual paste.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || '').trim();
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid pairing code' }, { status: 400 });
    }

    const codeHash = createHash('sha256').update(code).digest('hex');
    const pairing = await db.$queryRawUnsafe<{ id: string; "projectId": string; "expiresAt": Date }[]>(
      `SELECT id, "projectId", "expiresAt" FROM "BurpPairing"
       WHERE "codeHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP
       LIMIT 1`,
      codeHash,
    );
    const p = pairing[0];
    if (!p) return NextResponse.json({ error: 'Invalid or expired pairing code' }, { status: 404 });

    const project = await db.project.findUnique({ where: { id: p.projectId }, select: { id: true, name: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Single-use: consume the code, create the engagement key.
    await db.$executeRawUnsafe(
      `UPDATE "BurpPairing" SET "usedAt" = CURRENT_TIMESTAMP WHERE id = $1`, p.id,
    );
    const secret = `aeg-${randomBytes(24).toString('base64url')}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "EngagementKey" (id, "projectId", "keyHash", "keyPrefix", label, "createdAt")
       VALUES ($1,$2,$3,$4,'Provisioned via pairing',CURRENT_TIMESTAMP)`,
      uuidv4(), p.projectId,
      createHash('sha256').update(secret).digest('hex'),
      secret.slice(0, 8),
    );

    const origin = request.headers.get('origin') || '';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || (origin.startsWith('https') ? 'https' : 'http');
    const serverUrl = `${proto}://${host}`;

    return NextResponse.json({
      ok: true,
      project: project.name,
      serverUrl,
      engagementKey: secret,
    });
  } catch (error) {
    console.error('[POST /api/burp/provision]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
