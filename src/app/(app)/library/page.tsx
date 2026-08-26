import { connection } from 'next/server';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { VulnListClient } from './VulnListClient';
import { ensureEnvColumns } from '@/lib/ensure-env-columns';
import { loadSlaMatrix, computeSla, type SlaMatrix } from '@/lib/sla';

export default async function LibraryPage() {
  await connection();
  await ensureEnvColumns().catch(() => { /* tolerate */ });

  const findings = await db.finding.findMany({
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    include: {
      project: { select: { id: true, name: true, code: true } },
      assignee: { select: { id: true, name: true, initials: true } },
      // Evidence rows carry base64 screenshot blobs — loading them for the whole
      // list bloats the RSC payload by megabytes and is the #1 cause of the
      // slow vuln list. Only ids/filenames are shipped here; the slide-over
      // fetches the full evidence (with content) lazily when a finding opens.
      evidence: { orderBy: { createdAt: 'asc' }, select: { id: true, filename: true } },
    },
  });

  // Pull each project's engagementType in one shot — drives SLA selection.
  // Done via raw SQL so it works even if `prisma generate` hasn't run yet.
  const projEng = await db.$queryRawUnsafe<{ id: string; engagementType: string }[]>(
    `SELECT id, COALESCE("engagementType",'external') AS "engagementType" FROM "Project"`,
  ).catch(() => [] as { id: string; engagementType: string }[]);
  const engByProject: Record<string, string> = {};
  for (const r of projEng) engByProject[r.id] = r.engagementType;

  const slaMatrix: SlaMatrix = await loadSlaMatrix();

  const enriched = findings.map(f => {
    const eng = engByProject[f.projectId] || 'external';
    const sla = computeSla(f.severity, f.discovered || f.createdAt.toISOString().slice(0, 10), eng, slaMatrix, f.status);
    return { ...f, engagementType: eng, sla };
  });

  const projects = await db.project.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

  const users = await db.user.findMany({
    select: { id: true, name: true, initials: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Workspace', 'Vuln List']}
        title="Vulnerability List"
        subtitle={`${findings.length} findings across all projects`}
      />
      <VulnListClient findings={enriched as never} projects={projects} users={users} />
    </div>
  );
}
