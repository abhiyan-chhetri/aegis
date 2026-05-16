import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

type FindingLike = { severity: string; status: string };

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projects = await db.project.findMany({
      include: { lead: true, findings: true },
      orderBy: { createdAt: 'desc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = projects.map((project: any) => {
      const { findings, lead, ...rest } = project;
      return {
        ...rest,
        lead: {
          id: lead.id,
          name: lead.name,
          initials: lead.initials,
          role: lead.role,
          team: lead.team,
          email: lead.email,
        },
        findingCounts: {
          total: findings.length,
          critical: findings.filter((f: FindingLike) => f.severity === 'critical').length,
          high: findings.filter((f: FindingLike) => f.severity === 'high').length,
          medium: findings.filter((f: FindingLike) => f.severity === 'medium').length,
          low: findings.filter((f: FindingLike) => f.severity === 'low').length,
          info: findings.filter((f: FindingLike) => f.severity === 'info').length,
          open: findings.filter((f: FindingLike) => f.status === 'open').length,
          resolved: findings.filter((f: FindingLike) => f.status === 'resolved').length,
        },
      };
    });

    return NextResponse.json({ projects: result });
  } catch (error) {
    console.error('[GET /api/projects]', error);
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
    const { name, code, engagement, scope, members, assetOwners, startDate, endDate, leadId,
            targetCode, engagementYear, previousEngagementId,
            dataClassification, criticality } = body;

    if (!name || !code || !engagement || !startDate || !endDate || !leadId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, code, engagement, startDate, endDate, leadId' },
        { status: 400 }
      );
    }

    // `members` was added via ALTER TABLE so Prisma doesn't know about it.
    // Create project without it, then set via raw SQL.
    const project = await db.project.create({
      data: {
        name,
        code,
        engagement,
        scope: typeof scope === 'string' ? scope : JSON.stringify(scope ?? []),
        startDate,
        endDate,
        leadId,
      },
      include: { lead: true },
    });

    // Set members, assetOwners, and engagement fields via raw SQL
    const membersJson = Array.isArray(members) ? JSON.stringify(members) : (members ?? '[]');
    const assetOwnersJson = Array.isArray(assetOwners) ? JSON.stringify(assetOwners) : (assetOwners ?? '[]');
    await db.$executeRawUnsafe(
      `UPDATE "Project" SET members = $1, "assetOwners" = $2, "targetCode" = $3, "engagementYear" = $4, "previousEngagementId" = $5,
              "dataClassification" = $6, "criticality" = $7
       WHERE id = $8`,
      membersJson, assetOwnersJson,
      targetCode || code,
      engagementYear || '',
      previousEngagementId || null,
      (typeof dataClassification === 'string' && /^C[1-4]$/.test(dataClassification)) ? dataClassification : 'C3',
      (typeof criticality === 'string' && ['diamond','silver','bronze','other'].includes(criticality)) ? criticality : 'silver',
      project.id
    );

    // Log audit event
    await db.$executeRawUnsafe(
      `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", changes, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      uuidv4(), session.id, 'create', 'Project', project.id,
      JSON.stringify({ name, code, engagement, startDate, endDate }),
      new Date().toISOString()
    );

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: unknown) {
    console.error('[POST /api/projects]', error);
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Project code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
