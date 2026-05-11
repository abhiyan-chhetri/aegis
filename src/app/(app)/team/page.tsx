import { connection } from 'next/server';
import React from 'react';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { TeamClient } from './TeamClient';

export default async function TeamPage() {
  await connection();
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <Topbar
        breadcrumb={['Workspace', 'Team']}
        title="Team"
        subtitle={`${projects.length} active engagements`}
      />
      <TeamClient
        loadByUser={loadByUser}
        findingsByUser={findingsByUser}
      />
    </div>
  );
}
