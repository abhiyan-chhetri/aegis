/* eslint-disable @typescript-eslint/no-explicit-any */

import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { ReportPreview } from './ReportPreview';

type Props = { params: Promise<{ id: string }> };

export default async function ReportPage({params }: Props) {
  await connection();
  const { id } = await params;

  const [project, rawRows, allUsers] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        findings: { include: { assignee: true, evidence: { orderBy: { createdAt: 'asc' } } } },
        lead: true,
        reports: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    db.$queryRawUnsafe<Record<string, string>[]>(
      `SELECT "executiveSummary", methodology, "attackNarrative", members FROM "Project" WHERE id = $1`, id
    ),
    db.user.findMany({ select: { id: true, name: true, initials: true, role: true } }),
  ]);

  if (!project) notFound();

  const rawExtra = rawRows[0] ?? {};

  const counts = {
    critical: project.findings.filter(f => f.severity === 'critical').length,
    high: project.findings.filter(f => f.severity === 'high').length,
    medium: project.findings.filter(f => f.severity === 'medium').length,
    low: project.findings.filter(f => f.severity === 'low').length,
    info: project.findings.filter(f => f.severity === 'info').length,
  };

  const withScores = project.findings.filter(f => f.cvss > 0);
  const riskScore = withScores.length > 0
    ? Math.round(withScores.reduce((a, f) => a + f.cvss, 0) / withScores.length * 10) / 10
    : 0;

  // Fetch active report template CSS
  const template = await db.reportTemplate.findFirst({ where: { name: 'Technical Report' } });

  // Resolve team member objects from stored IDs
  const memberIds: string[] = (() => { try { return JSON.parse(rawExtra.members ?? '[]'); } catch { return []; } })();
  const teamMembers = allUsers.filter(u => memberIds.includes(u.id));

  // Serialize dates for client components + merge raw extra fields
  const serializedProject = {
    ...project,
    executiveSummary: rawExtra.executiveSummary ?? '',
    methodology:     rawExtra.methodology     ?? '',
    attackNarrative: rawExtra.attackNarrative ?? '',
    members:         rawExtra.members         ?? '[]',
    startDate: project.startDate ? new Date(project.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'TBD',
    endDate: project.endDate ? new Date(project.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'TBD',
    createdAt: undefined,
    updatedAt: undefined,
  };

  const serializedFindings = project.findings.map(f => ({
    ...f,
    discovered: f.discovered ? new Date(f.discovered).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
    createdAt: undefined,
    updatedAt: undefined,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Projects', project.name, 'Report']}
        title="Report Preview"
        subtitle={`${project.engagement} · ${project.code}`}
        showSearch={false}
        actions={
          <Link href={`/projects/${id}`} className="btn btn-ghost btn-sm">
            <Ico name="chevLeft" size={14} />
            Back
          </Link>
        }
      />
      <ReportPreview
        project={serializedProject as any}
        findings={serializedFindings as any}
        counts={counts}
        riskScore={riskScore}
        latestReport={project.reports[0] as any ?? null}
        templateCSS={template?.source ?? undefined}
        teamMembers={teamMembers}
        reportId={project.reports[0]?.id}
        allUsers={allUsers.map(u => ({ id: u.id, name: u.name }))}
      />
    </div>
  );
}
