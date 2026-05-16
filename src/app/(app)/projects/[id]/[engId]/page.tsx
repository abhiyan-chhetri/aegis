/* eslint-disable @typescript-eslint/no-explicit-any */
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { sortFindingsBySortOrder } from '@/lib/sortFindings';
import { ProjectTabs } from '../ProjectTabs';

// /projects/[id]/[engId]
// [id]    = the targetCode / project code slug  (e.g. PEN-222)
// [engId] = the engagement UUID
type Props = { params: Promise<{ id: string; engId: string }> };

export default async function EngagementDetailPage({ params }: Props) {
  await connection();
  const { id: slug, engId } = await params;

  // Load the specific engagement by UUID
  const [project, allUsers, rawRows, engRows] = await Promise.all([
    db.project.findUnique({
      where: { id: engId },
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
      `SELECT "executiveSummary", methodology, "attackNarrative", members, COALESCE(notes, '') as notes FROM "Project" WHERE id = $1`, engId
    ),
    db.$queryRawUnsafe<any[]>(
      `SELECT COALESCE("targetCode",'') AS "targetCode", COALESCE("engagementYear",'') AS "engagementYear", "previousEngagementId" FROM "Project" WHERE id = $1`, engId
    ),
  ]);

  if (!project) notFound();

  // Apply manual drag-and-drop order without depending on a regenerated client
  project.findings = await sortFindingsBySortOrder(project.findings, engId);

  // Fetch review data for reports
  const reportIds = project.reports?.map((r: any) => r.id) ?? [];
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

  const rawExtra = rawRows[0] ?? {};
  const engExtra = engRows[0] ?? { targetCode: '', engagementYear: '', previousEngagementId: null };

  // Fetch engagement siblings (other engagements under the same target)
  let engagementSiblings: any[] = [];
  const effectiveTargetCode = engExtra.targetCode || slug;
  if (effectiveTargetCode) {
    const siblings = await db.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.code, p.name, p.status,
             COALESCE(p."engagementYear",'') AS "engagementYear",
             p."startDate", p."endDate",
             COUNT(f.id)::int AS "findingCount",
             COUNT(CASE WHEN f.status = 'resolved' THEN 1 END)::int AS "resolvedCount"
      FROM "Project" p
      LEFT JOIN "Finding" f ON f."projectId" = p.id
      WHERE p."targetCode" = $1
      GROUP BY p.id, p.code, p.name, p.status, p."engagementYear", p."startDate", p."endDate"
      ORDER BY COALESCE(p."engagementYear",'') DESC, p."startDate" DESC
    `, effectiveTargetCode);
    engagementSiblings = siblings.map((s: any) => ({ ...s, isCurrent: s.id === engId }));
  }

  // Fetch carry-over findings from previous engagement
  let carryoverFindings: any[] = [];
  if (engExtra.previousEngagementId) {
    carryoverFindings = await db.$queryRawUnsafe<any[]>(`
      SELECT id, code, title, severity, status FROM "Finding"
      WHERE "projectId" = $1 AND status NOT IN ('resolved','accepted')
      ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END
    `, engExtra.previousEngagementId);
  }

  const projectWithRaw = {
    ...project,
    executiveSummary: rawExtra.executiveSummary ?? '',
    methodology:      rawExtra.methodology ?? '',
    attackNarrative:  rawExtra.attackNarrative ?? '',
    members:          rawExtra.members ?? '[]',
    notes:            rawExtra.notes ?? '',
    targetCode:       engExtra.targetCode ?? '',
    engagementYear:   engExtra.engagementYear ?? '',
    previousEngagementId: engExtra.previousEngagementId ?? null,
  };

  const counts = {
    critical: project.findings.filter((f: any) => f.severity === 'critical').length,
    high:     project.findings.filter((f: any) => f.severity === 'high').length,
    medium:   project.findings.filter((f: any) => f.severity === 'medium').length,
    low:      project.findings.filter((f: any) => f.severity === 'low').length,
    info:     project.findings.filter((f: any) => f.severity === 'info').length,
  };

  let scopeRows: { asset: string; type: string; notes: string }[] = [];
  try {
    const parsed = JSON.parse((project as any).scope ?? '[]');
    scopeRows = parsed.map((item: any) => {
      if (typeof item === 'string') return { asset: item, type: '', notes: '' };
      return { asset: item.asset || '', type: item.type || '', notes: item.notes || '' };
    });
  } catch { scopeRows = []; }

  // Back link goes to the year selector for this slug
  const backSlug = slug;
  const yearLabel = engExtra.engagementYear || project.code;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={[
          { label: 'Projects', href: '/projects' },
          { label: slug, href: `/projects/${slug}` },
          yearLabel,
        ]}
        title={project.name}
        subtitle={`${(project as any).engagement} · ${yearLabel}`}
        actions={
          <>
            <Link href={`/projects/${engId}/edit`} className="btn btn-ghost btn-sm">
              <Ico name="settings" size={14} />
              Edit
            </Link>
            <Link href={`/projects/${engId}/report`} className="btn btn-ghost btn-sm">
              <Ico name="paper" size={14} />
              Preview report
            </Link>
            <Link href={`/projects/${engId}/findings/new`} className="btn btn-primary btn-sm">
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
        engagementSiblings={engagementSiblings}
        carryoverFindings={carryoverFindings}
        backSlug={backSlug}
      />
    </div>
  );
}
