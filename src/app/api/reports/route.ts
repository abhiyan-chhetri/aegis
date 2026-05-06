import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reports = await db.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, code: true },
        },
        author: {
          select: { id: true, name: true, initials: true, role: true },
        },
        template: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('[GET /api/reports]', error);
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
    const { projectId, templateId, templateName = '', version = 'v1', status = 'draft' } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // ── 1 report per project — return existing if it already exists ───────────
    const existing = await db.report.findFirst({
      where: { projectId },
      include: {
        project: { select: { id: true, name: true, code: true } },
        author:  { select: { id: true, name: true, initials: true, role: true } },
        template:{ select: { id: true, name: true } },
      },
    });
    if (existing) {
      return NextResponse.json({ report: existing }, { status: 200 });
    }

    // Auto-generate code: R-{count+1} padded to 4 digits
    const count = await db.report.count();
    const code = `R-${String(count + 1).padStart(4, '0')}`;

    const report = await db.report.create({
      data: {
        code,
        projectId,
        templateId: templateId ?? null,
        templateName,
        version,
        status,
        authorId: session.id,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        author:  { select: { id: true, name: true, initials: true, role: true } },
        template:{ select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/reports]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
