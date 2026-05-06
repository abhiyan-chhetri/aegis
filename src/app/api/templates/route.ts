import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await db.reportTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[GET /api/templates]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      audience = 'Engineering',
      pages = '10+',
      tone = 'Detailed',
      engine = 'LaTeX · XeLaTeX',
      source = '',
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const template = await db.reportTemplate.create({
      data: { name, audience, pages, tone, engine, source },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/templates]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
