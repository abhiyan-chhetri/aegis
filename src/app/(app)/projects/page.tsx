/* eslint-disable @typescript-eslint/no-explicit-any */
import { connection } from 'next/server';
import React from 'react';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { ProjectsClient } from './ProjectsClient';
import Link from 'next/link';
import { Ico } from '@/components/chrome/icons';

export default async function ProjectsPage() {
  await connection();
  const projects = await db.project.findMany({
    include: { lead: true, findings: true },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch targetCode for each project (raw column not in Prisma schema)
  const projectIds = projects.map((p: any) => p.id);
  const targetCodeMap: Record<string, string> = {};
  if (projectIds.length > 0) {
    const placeholders = projectIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const tcRows = await db.$queryRawUnsafe<{ id: string; targetCode: string }[]>(
      `SELECT id, COALESCE("targetCode",'') AS "targetCode" FROM "Project" WHERE id IN (${placeholders})`,
      ...projectIds
    );
    for (const r of tcRows) targetCodeMap[r.id] = r.targetCode;
  }

  const allRows = projects.map((p: any) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    engagement: p.engagement,
    status: p.status,
    progress: p.progress,
    targetCode: targetCodeMap[p.id] || '',
    lead: { id: p.lead.id, name: p.lead.name, initials: p.lead.initials || p.lead.name.slice(0, 2) },
    counts: {
      critical: (p.findings as any[]).filter((f: any) => f.severity === 'critical').length,
      high:     (p.findings as any[]).filter((f: any) => f.severity === 'high').length,
      medium:   (p.findings as any[]).filter((f: any) => f.severity === 'medium').length,
      low:      (p.findings as any[]).filter((f: any) => f.severity === 'low').length,
      info:     (p.findings as any[]).filter((f: any) => f.severity === 'info').length,
    },
  }));

  // Deduplicate: one card per unique target (grouped by targetCode || code)
  // rows are already sorted by createdAt DESC, so first entry = most recent engagement
  type RowType = typeof allRows[0] & { slug: string; engagementCount: number };
  const slugGroups = new Map<string, RowType>();
  for (const row of allRows) {
    const slug = row.targetCode || row.code;
    if (!slugGroups.has(slug)) {
      // First (most recent) engagement provides the representative metadata
      slugGroups.set(slug, {
        ...row,
        slug,
        engagementCount: 0,
        counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      });
    }
    const group = slugGroups.get(slug)!;
    group.engagementCount += 1;
    // Sum finding counts across all engagements under this target
    group.counts.critical += row.counts.critical;
    group.counts.high     += row.counts.high;
    group.counts.medium   += row.counts.medium;
    group.counts.low      += row.counts.low;
    group.counts.info     += row.counts.info;
  }
  const rows = Array.from(slugGroups.values());

  const STATUS_META: Record<string, { label: string; color: string }> = {
    'in-progress':    { label: 'in-progress',    color: 'var(--status-progress)' },
    'in-review':      { label: 'in-review',       color: 'var(--status-review)'   },
    'completed':      { label: 'completed',       color: 'var(--status-resolved)' },
    'scheduled':      { label: 'scheduled',       color: 'var(--ink-2)'           },
    'waiting-client': { label: 'waiting-client',  color: 'var(--status-progress)' },
    'open':           { label: 'open',             color: 'var(--status-open)'     },
  };

  // Status stats based on deduplicated projects (most-recent engagement's status)
  const statusCounts: Record<string, number> = {};
  for (const p of rows) {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  }

  const statusStats = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      label: status,
      count,
      color: STATUS_META[status]?.color || 'var(--ink-2)',
    }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        title="Projects"
        breadcrumb={['Aegis', 'Projects']}
        actions={
          <Link href="/projects/new" className="btn btn-primary btn-sm">
            <Ico name="plus" size={13} />
            New project
          </Link>
        }
      />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-0)' }}>
        <ProjectsClient projects={rows} statusStats={statusStats} />
      </div>
    </div>
  );
}
