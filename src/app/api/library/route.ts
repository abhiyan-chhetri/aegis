import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await db.vulnTemplate.findMany({
      orderBy: [{ uses: 'desc' }, { code: 'asc' }],
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[GET /api/library]', error);
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
      code,
      title,
      cwe = '',
      severity = 'medium',
      owner = 'AppSec',
      description = '',
      reproduction = '',
      impact = '',
      remediation = '',
      uses = 0,
    } = body;

    if (!code || !title) {
      return NextResponse.json(
        { error: 'code and title are required' },
        { status: 400 }
      );
    }

    const template = await db.vulnTemplate.create({
      data: { code, title, cwe, severity, owner, description, reproduction, impact, remediation, uses },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: unknown) {
    console.error('[POST /api/library]', error);
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Template code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
