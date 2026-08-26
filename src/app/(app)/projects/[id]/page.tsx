/* eslint-disable @typescript-eslint/no-explicit-any */
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { TrackRecent } from '@/components/chrome/TrackRecent';
import { Ico } from '@/components/chrome/icons';
import { sortFindingsBySortOrder } from '@/lib/sortFindings';
import { ProjectTabs } from './ProjectTabs';
import { EngagementYearSelector } from './EngagementYearSelector';

type Props = { params: Promise<{ id: string }> };


export default async function ProjectPage({ params }: Props) {
  await connection();
  const { id: slug } = await params;

  // ── Look up by code OR targetCode ─────────────────────────────────────────
  // slug is the URL segment — could be a unique project code or a shared targetCode
  const engagementRows = await db.$queryRawUnsafe<any[]>(`
    SELECT p.id, p.code, p.name, p.status,
           COALESCE(p."targetCode",'') AS "targetCode",
           COALESCE(p."engagementYear",'') AS "engagementYear",
           p."startDate", p."endDate",
           COUNT(f.id)::int AS "findingCount",
           COUNT(CASE WHEN f.status = 'resolved' THEN 1 END)::int AS "resolvedCount"
    FROM "Project" p
    LEFT JOIN "Finding" f ON f."projectId" = p.id
    WHERE p."targetCode" = $1 OR p.code = $1 OR p.id = $1
    GROUP BY p.id, p.code, p.name, p.status, p."targetCode", p."engagementYear", p."startDate", p."endDate"
    ORDER BY COALESCE(p."engagementYear",'') DESC NULLS LAST, p."startDate" DESC
  `, slug);

  if (engagementRows.length === 0) notFound();

  // ── Multiple engagements under same targetCode → year selector ────────────
  // Direct navigation happens when the slug IS the engagement's id. Ids are
  // CUIDs (e.g. cmt98xccn000bckpyszei1tmf), NOT hyphenated UUIDs — the old
  // UUID-pattern check sent every "Back to project" / `/projects/{id}` link to
  // the year selector instead of the project's finding list.
  const navigatedById = engagementRows.length === 1 && engagementRows[0].id === slug;
  if (!navigatedById) {
    return <EngagementYearSelector engagements={engagementRows} slug={slug} />;
  }

  // ── Single engagement — render full project detail ────────────────────────
  const projectId = engagementRows[0].id;

  const [project, allUsers, rawRows, engRows] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
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
      `SELECT "executiveSummary", methodology, "attackNarrative", members, COALESCE(notes, '') as notes FROM "Project" WHERE id = $1`, projectId
    ),
    db.$queryRawUnsafe<any[]>(
      `SELECT COALESCE("targetCode",'') AS "targetCode",
              COALESCE("engagementYear",'') AS "engagementYear",
              COALESCE("engagementType",'external') AS "engagementType",
              "previousEngagementId"
       FROM "Project" WHERE id = $1`, projectId
    ),
  ]);

  if (!project) notFound();

  // Apply manual drag-and-drop order. Done after fetch (instead of via Prisma
  // orderBy) so it works even before someone runs `prisma generate`.
  project.findings = await sortFindingsBySortOrder(project.findings, projectId);

  // Fetch review data for reports
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

  const rawExtra = rawRows[0] ?? {};
  const engExtra = engRows[0] ?? { targetCode: '', engagementYear: '', previousEngagementId: null };

  // Fetch engagement siblings
  let engagementSiblings: any[] = [];
  if (engExtra.targetCode) {
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
    `, engExtra.targetCode);
    engagementSiblings = siblings.map((s: any) => ({ ...s, isCurrent: s.id === projectId }));
  }

  // Fetch carry-over findings
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
    engagementType:   engExtra.engagementType ?? 'external',
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

  // Use the targetCode or code as the back-link slug
  const backSlug = engExtra.targetCode || project.code;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TrackRecent
        id={project.id}
        type="project"
        label={project.name}
        sub={`${project.engagement || ''}${engExtra.engagementYear ? ` · ${engExtra.engagementYear}` : ` · ${project.code}`}`}
        href={`/projects/${projectId}`}
        icon="projects"
      />
      <Topbar
        breadcrumb={[
          { label: 'Projects', href: '/projects' },
          project.name,
        ]}
        title={project.name}
        subtitle={`${project.engagement} · ${engExtra.engagementYear || project.code}`}
        actions={
          <>
            <Link href={`/projects/${projectId}/edit`} className="btn btn-ghost btn-sm">
              <Ico name="settings" size={14} />
              Edit
            </Link>
            <Link href={`/projects/${projectId}/report`} className="btn btn-ghost btn-sm">
              <Ico name="paper" size={14} />
              Preview report
            </Link>
            <Link href={`/projects/${projectId}/findings/new`} className="btn btn-primary btn-sm">
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
