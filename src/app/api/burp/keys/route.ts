import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/burp/keys — create an engagement key for the Burp extension.
 * Body: { projectId, label? }. The plaintext secret is returned EXACTLY ONCE.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const projectId = String(body.projectId || '');
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const secret = `aeg-${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(secret).digest('hex');
    const keyPrefix = secret.slice(0, 8);

    const key = await db.engagementKey.create({
      data: {
        projectId,
        keyHash,
        keyPrefix,
        label: String(body.label || 'Burp extension').slice(0, 80),
      },
    });

    return NextResponse.json({ keyId: key.id, key: secret, keyPrefix, project: { id: project.id, name: project.name } });
  } catch (error) {
    console.error('[POST /api/burp/keys]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
