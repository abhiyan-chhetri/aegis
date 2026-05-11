export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { VulnListClient } from './VulnListClient';

export default async function LibraryPage() {
  const findings = await db.finding.findMany({
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    include: {
      project: { select: { id: true, name: true, code: true } },
      assignee: { select: { id: true, name: true, initials: true } },
    },
  });

  const projects = await db.project.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Workspace', 'Vuln List']}
        title="Vulnerability List"
        subtitle={`${findings.length} findings across all projects`}
      />
      <VulnListClient findings={findings as never} projects={projects} />
    </div>
  );
}
