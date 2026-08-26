import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/burp/keys/:id — revoke an engagement key (extension loses access).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const key = await db.engagementKey.findUnique({ where: { id }, select: { id: true, projectId: true } });
    if (!key) return NextResponse.json({ error: 'Key not found' }, { status: 404 });

    await db.engagementKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true, projectId: key.projectId });
  } catch (error) {
    console.error('[DELETE /api/burp/keys/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
