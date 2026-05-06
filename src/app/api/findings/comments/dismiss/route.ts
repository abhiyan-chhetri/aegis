import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { commentId } = body;

    if (!commentId) {
      return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
    }

    // Store dismissed mentions using Activity model
    // Mark as 'dismiss_mention' action with the comment ID as target
    await db.activity.create({
      data: {
        userId: session.id,
        action: 'dismiss_mention',
        target: commentId,
        detail: JSON.stringify({ dismissedAt: new Date().toISOString() }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/findings/comments/dismiss]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get dismissed comment IDs for the current user
    const dismissedRecords = await db.activity.findMany({
      where: {
        userId: session.id,
        action: 'dismiss_mention',
      },
      select: {
        target: true,
      },
    });

    const dismissedIds = dismissedRecords.map(r => r.target);

    return NextResponse.json({ dismissed: dismissedIds });
  } catch (error) {
    console.error('[GET /api/findings/comments/dismiss]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
