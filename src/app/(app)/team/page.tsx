import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import React from 'react';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Topbar } from '@/components/chrome/Topbar';
import { TeamClient } from './TeamClient';
import { PersonalStats } from './PersonalStats';

export default async function TeamPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect('/login');

  // ── Workload (existing) ────────────────────────────────────────────────────
  const projects = await db.project.findMany({
    where: { status: { not: 'completed' } },
    include: { findings: true },
  });

  const loadByUser: Record<string, number> = {};
  const findingsByUser: Record<string, number> = {};
  for (const p of projects) {
    if (p.leadId) loadByUser[p.leadId] = (loadByUser[p.leadId] || 0) + 1;
    for (const f of p.findings) {
      if (f.assigneeId) findingsByUser[f.assigneeId] = (findingsByUser[f.assigneeId] || 0) + 1;
    }
  }

  // ── Personal stats for the current user ───────────────────────────────────
  // Findings discovered (assigneeId = me) across ALL projects, all time
  const myFindings = await db.finding.findMany({
    where: { assigneeId: session.id },
    select: {
      id: true, severity: true, status: true, cvss: true, createdAt: true,
      projectId: true, cwe: true,
    },
  });
  const projectsLed = await db.project.count({ where: { leadId: session.id } });

  // Activity: how many distinct projects did they touch? (audit log)
  const auditCountRaw = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "AuditLog" WHERE "userId" = $1`,
    session.id,
  ).catch(() => [] as { count: bigint }[]);
  const auditEvents = Number(auditCountRaw[0]?.count ?? 0);

  const personalStats = {
    totalFindings: myFindings.length,
    byStatus: countByKey(myFindings.map(f => f.status)),
    bySeverity: countByKey(myFindings.map(f => f.severity)),
    avgCvss: myFindings.filter(f => f.cvss > 0).reduce((a, f) => a + f.cvss, 0) /
             Math.max(1, myFindings.filter(f => f.cvss > 0).length),
    projectsTouched: new Set(myFindings.map(f => f.projectId)).size,
    projectsLed,
    auditEvents,
    monthlyVelocity: monthlyVelocity(myFindings.map(f => ({ createdAt: f.createdAt }))),
    topCwes: topN(myFindings.map(f => f.cwe).filter(Boolean) as string[], 5),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Topbar
        breadcrumb={['Workspace', 'Team']}
        title="Team"
        subtitle={`${projects.length} active engagements`}
      />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '24px 28px 0' }}>
          <PersonalStats userName={session.name || 'You'} stats={personalStats} />
        </div>
        <TeamClient
          loadByUser={loadByUser}
          findingsByUser={findingsByUser}
        />
      </div>
    </div>
  );
}

function countByKey(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of arr) out[k] = (out[k] || 0) + 1;
  return out;
}

function topN(arr: string[], n: number): { key: string; count: number }[] {
  const c: Record<string, number> = {};
  for (const k of arr) c[k] = (c[k] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
}

function monthlyVelocity(arr: { createdAt: Date }[]): { label: string; count: number }[] {
  const buckets: { label: string; count: number; key: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    buckets.push({ label, count: 0, key });
  }
  for (const f of arr) {
    const d = new Date(f.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = buckets.find(x => x.key === key);
    if (b) b.count++;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}
