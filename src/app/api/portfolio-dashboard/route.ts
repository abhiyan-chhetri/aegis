import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // All projects with full data
    const projects = await db.project.findMany({
      include: {
        lead: { select: { id: true, name: true, initials: true } },
        _count: { select: { findings: true, reports: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // All findings
    const allFindings = await db.finding.findMany({
      select: { severity: true, status: true, projectId: true, assigneeId: true },
    });

    // All users for workload name resolution
    const allUsers = await db.user.findMany({ select: { id: true, name: true, initials: true } });
    const userMap: Record<string, { name: string; initials: string }> = {};
    for (const u of allUsers) userMap[u.id] = { name: u.name, initials: u.initials || u.name.slice(0, 2) };

    // Global severity + status distribution
    const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const statusCounts: Record<string, number> = { open: 0, 'in-progress': 0, resolved: 0 };
    const projectMetrics: Record<string, Record<string, number>> = {};
    const projectStatus: Record<string, Record<string, number>> = {};

    for (const f of allFindings) {
      const sev = f.severity.toLowerCase();
      if (sev in severityCounts) severityCounts[sev]++;

      const st = f.status.toLowerCase();
      if (st in statusCounts) statusCounts[st]++;

      if (!projectMetrics[f.projectId]) projectMetrics[f.projectId] = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      if (sev in projectMetrics[f.projectId]) projectMetrics[f.projectId][sev]++;

      if (!projectStatus[f.projectId]) projectStatus[f.projectId] = { open: 0, 'in-progress': 0, resolved: 0 };
      if (st in projectStatus[f.projectId]) projectStatus[f.projectId][st]++;
    }

    // Per-project workload (resolved to user names)
    const projectRows = await Promise.all(projects.map(async (project: any) => {
      const assignedFindings = allFindings.filter(f => f.projectId === project.id && f.assigneeId);
      const workloadById: Record<string, number> = {};
      for (const f of assignedFindings) {
        if (f.assigneeId) workloadById[f.assigneeId] = (workloadById[f.assigneeId] || 0) + 1;
      }
      const workload = Object.entries(workloadById).map(([uid, count]) => ({
        userId: uid,
        name: userMap[uid]?.name || 'Unknown',
        initials: userMap[uid]?.initials || '?',
        count,
      })).sort((a, b) => b.count - a.count);

      const m = projectMetrics[project.id] || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      const s = projectStatus[project.id] || { open: 0, 'in-progress': 0, resolved: 0 };

      // Upsert daily snapshot
      const today = new Date().toISOString().split('T')[0];
      const [existing] = await db.$queryRawUnsafe<any[]>(
        `SELECT id FROM ProjectSnapshot WHERE projectId = ? AND date(snapshotDate) = ?`,
        project.id, today
      );
      if (!existing) {
        await db.$executeRawUnsafe(
          `INSERT INTO ProjectSnapshot (id, projectId, snapshotDate, criticalCount, highCount, mediumCount, lowCount, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          uuidv4(), project.id, new Date().toISOString(),
          m.critical, m.high, m.medium, m.low, new Date().toISOString()
        );
      }

      return {
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
        engagement: project.engagement || '',
        status: project.status,
        progress: project.progress || 0,
        lead: project.lead ? { name: project.lead.name, initials: project.lead.initials || project.lead.name.slice(0, 2) } : null,
        findingCount: project._count.findings,
        reportCount: project._count.reports,
        metrics: m,
        statusBreakdown: s,
        workload,
      };
    }));

    // 7-day trend snapshots
    const trendRows = await db.$queryRawUnsafe<any[]>(
      `SELECT projectId, snapshotDate, criticalCount, highCount, mediumCount, lowCount
       FROM ProjectSnapshot
       WHERE snapshotDate >= datetime('now', '-7 days')
       ORDER BY snapshotDate ASC`
    );

    // Global team workload
    const globalWorkload: Record<string, number> = {};
    for (const f of allFindings) {
      if (f.assigneeId) globalWorkload[f.assigneeId] = (globalWorkload[f.assigneeId] || 0) + 1;
    }
    const teamWorkload = Object.entries(globalWorkload)
      .map(([uid, count]) => ({ userId: uid, name: userMap[uid]?.name || 'Unknown', initials: userMap[uid]?.initials || '?', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        totalProjects: projects.length,
        totalFindings: allFindings.length,
        severityDistribution: severityCounts,
        statusDistribution: statusCounts,
      },
      projects: projectRows,
      teamWorkload,
      trends: trendRows,
    });
  } catch (error) {
    console.error('[GET /api/portfolio-dashboard]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
