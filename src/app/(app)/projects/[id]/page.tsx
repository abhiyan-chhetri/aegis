export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { ProjectTabs } from './ProjectTabs';

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;

  const [project, allUsers, rawRows] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        lead: true,
        findings: { include: { assignee: true }, orderBy: { createdAt: 'desc' } },
        reports: { include: { author: true }, orderBy: { createdAt: 'desc' }, take: 3 },
      },
    }),
    db.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, initials: true, role: true, email: true },
    }),
    db.$queryRawUnsafe<Record<string, string>[]>(
      `SELECT "executiveSummary", methodology, "attackNarrative", members, COALESCE(notes, '') as notes FROM "Project" WHERE id = $1`, id
    ),
  ]);

  // Fetch review data for reports (raw columns not in Prisma schema)
  const reportIds = project?.reports?.map((r: any) => r.id) ?? [];
  const reportReviewData: Record<string, { reviewComment: string; reviewedAt: string | null; reviewerId: string | null }> = {};
  if (reportIds.length > 0) {
    const placeholders = reportIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const reviewRows = await db.$queryRawUnsafe<any[]>(
      `SELECT id, "reviewComment", "reviewedAt", "reviewerId" FROM "Report" WHERE id IN (${placeholders})`,
      ...reportIds
    );
    for (const row of reviewRows) {
      reportReviewData[row.id] = {
        reviewComment: row.reviewComment || '',
        reviewedAt: row.reviewedAt || null,
        reviewerId: row.reviewerId || null,
      };
    }
  }

  if (!project) notFound();

  const rawExtra = rawRows[0] ?? {};
  const projectWithRaw = {
    ...project,
    executiveSummary: rawExtra.executiveSummary ?? '',
    methodology:      rawExtra.methodology      ?? '',
    attackNarrative:  rawExtra.attackNarrative  ?? '',
    members:          rawExtra.members          ?? '[]',
    notes:            rawExtra.notes            ?? '',
  };

  const counts = {
    critical: project.findings.filter(f => f.severity === 'critical').length,
    high:     project.findings.filter(f => f.severity === 'high').length,
    medium:   project.findings.filter(f => f.severity === 'medium').length,
    low:      project.findings.filter(f => f.severity === 'low').length,
    info:     project.findings.filter(f => f.severity === 'info').length,
  };

  let scopeRows: { asset: string; type: string; notes: string }[] = [];
  try {
    const parsed = JSON.parse((project as any).scope ?? '[]');
    scopeRows = parsed.map((item: any) => {
      if (typeof item === 'string') return { asset: item, type: '', notes: '' };
      return { asset: item.asset || '', type: item.type || '', notes: item.notes || '' };
    });
  } catch { scopeRows = []; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Projects', project.name]}
        title={project.name}
        subtitle={`${project.engagement} · ${project.code}`}
        actions={
          <>
            <Link href={`/projects/${id}/edit`} className="btn btn-ghost btn-sm">
              <Ico name="settings" size={14} />
              Edit
            </Link>
            <Link href={`/projects/${id}/report`} className="btn btn-ghost btn-sm">
              <Ico name="paper" size={14} />
              Preview report
            </Link>
            <Link href={`/projects/${id}/findings/new`} className="btn btn-primary btn-sm">
              <Ico name="plus" size={14} />
              Add finding
            </Link>
          </>
        }
      />
      <ProjectTabs
        project={projectWithRaw as any}
        findings={project.findings as any}
        reports={project.reports.map((r: any) => ({
          ...r,
          ...(reportReviewData[r.id] || { reviewComment: '', reviewedAt: null, reviewerId: null }),
        })) as any}
        counts={counts}
        scopeRows={scopeRows}
        allUsers={allUsers as any}
      />
    </div>
  );
}
