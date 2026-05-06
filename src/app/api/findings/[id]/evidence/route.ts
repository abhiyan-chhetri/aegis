import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: findingId } = await params;

    const evidence = await db.evidence.findMany({
      where: { findingId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ evidence });
  } catch (error) {
    console.error('[GET /api/findings/[id]/evidence]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: findingId } = await params;

    // Verify finding exists
    const finding = await db.finding.findUnique({ where: { id: findingId } });
    if (!finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      type = 'screenshot',
      caption = '',
      content = '',
      filename = '',
    } = body;

    const evidenceItem = await db.evidence.create({
      data: {
        findingId,
        type,
        caption,
        content,
        filename,
      },
    });

    return NextResponse.json({ evidence: evidenceItem }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/findings/[id]/evidence]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
