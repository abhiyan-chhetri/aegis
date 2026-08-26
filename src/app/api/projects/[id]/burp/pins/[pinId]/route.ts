import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** DELETE /api/projects/:id/burp/pins/:pinId — remove a pin from the rail. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pinId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, pinId } = await params;
    const r = await db.$executeRawUnsafe(
      `DELETE FROM "BurpPin" WHERE id = $1 AND "projectId" = $2`,
      pinId, id,
    );
    return NextResponse.json({ success: r > 0 });
  } catch (error) {
    console.error('[DELETE /api/projects/[id]/burp/pins/[pinId]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
