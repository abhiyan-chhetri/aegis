import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// All content fields that we manage via raw SQL (bypasses Prisma schema validation entirely)
// This includes executiveSummary even though it's in the original schema — raw SQL is safer
// for fields that may be affected by our manual class.ts patch.
const CONTENT_COLS = ['executiveSummary', 'methodology', 'attackNarrative', 'members'] as const;
type ContentCol = typeof CONTENT_COLS[number];

export async function getRawContentFields(id: string): Promise<Record<ContentCol, string>> {
  const rows = await db.$queryRawUnsafe<Record<string, string>[]>(
    `SELECT executiveSummary, methodology, attackNarrative, members FROM "Project" WHERE id = $1`,
    id
  );
  const row = rows[0] ?? {};
  return {
    executiveSummary: row.executiveSummary ?? '',
    methodology:      row.methodology      ?? '',
    attackNarrative:  row.attackNarrative  ?? '',
    members:          row.members          ?? '[]',
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const [project, content] = await Promise.all([
      db.project.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, initials: true, role: true, team: true, email: true } },
          findings: {
            orderBy: { createdAt: 'desc' },
            include: { assignee: { select: { id: true, name: true, initials: true } } },
          },
          reports: {
            orderBy: { createdAt: 'desc' },
            include: { author: { select: { id: true, name: true, initials: true } } },
          },
        },
      }),
      getRawContentFields(id),
    ]);

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({ project: { ...project, ...content } });
  } catch (error) {
    console.error('[GET /api/projects/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const {
      name, status, progress, engagement, scope,
      // Content fields — handled via raw SQL
      executiveSummary, methodology, attackNarrative, members,
      startDate, endDate, leadId,
    } = body;

    // ── Prisma-managed fields (in original schema, no risk) ───────────────────
    const prismaData: Record<string, unknown> = {};
    if (name !== undefined) prismaData.name = name;
    if (status !== undefined) prismaData.status = status;
    if (progress !== undefined) prismaData.progress = progress;
    if (engagement !== undefined) prismaData.engagement = engagement;
    if (scope !== undefined)
      prismaData.scope = typeof scope === 'string' ? scope : JSON.stringify(scope);
    if (startDate !== undefined) prismaData.startDate = startDate;
    if (endDate !== undefined) prismaData.endDate = endDate;
    if (leadId !== undefined) prismaData.leadId = leadId;

    // ── Content fields — always via raw SQL ───────────────────────────────────
    const rawUpdates: { col: string; val: string }[] = [];
    if (executiveSummary !== undefined)
      rawUpdates.push({ col: 'executiveSummary', val: String(executiveSummary) });
    if (methodology !== undefined)
      rawUpdates.push({ col: 'methodology', val: String(methodology) });
    if (attackNarrative !== undefined)
      rawUpdates.push({ col: 'attackNarrative', val: String(attackNarrative) });
    if (members !== undefined)
      rawUpdates.push({ col: 'members', val: Array.isArray(members) ? JSON.stringify(members) : String(members) });

    // Run everything in parallel
    await Promise.all([
      Object.keys(prismaData).length > 0
        ? db.project.update({ where: { id }, data: prismaData })
        : Promise.resolve(null),
      ...rawUpdates.map(({ col, val }) =>
        db.$executeRawUnsafe(`UPDATE "Project" SET "${col}" = $1 WHERE id = $2`, val, id)
      ),
    ]);

    // ── Revert report to 'in-review' if any project content changed ──────────
    // Content changes (text fields, members, metadata) invalidate an approved/rejected report
    const anythingChanged = rawUpdates.length > 0 || Object.keys(prismaData).length > 0;

    if (anythingChanged) {
      const existingReport = await db.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT id, status FROM "Report" WHERE "projectId" = $1`, id
      );
      const report = existingReport[0];
      if (report && (report.status === 'approved' || report.status === 'rejected')) {
        await db.report.update({ where: { id: report.id }, data: { status: 'in-review' } });
        await db.$executeRawUnsafe(
          `UPDATE "Report" SET "reviewComment" = '', "reviewedAt" = NULL WHERE id = $1`,
          report.id
        );
      }
    }

    // Fetch the full updated project and content fields
    const [project, content] = await Promise.all([
      db.project.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, initials: true, role: true, team: true, email: true } },
        },
      }),
      getRawContentFields(id),
    ]);

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({ project: { ...project, ...content } });
  } catch (error: unknown) {
    console.error('[PATCH /api/projects/[id]]', error);
    if (
      typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await db.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[DELETE /api/projects/[id]]', error);
    if (
      typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
