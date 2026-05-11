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

    // All users for workload name resolution
    const allUsers = await db.user.findMany({ select: { id: true, name: true, initials: true } });
    const userMap: Record<string, { name: string; initials: string }> = {};
    for (const u of allUsers) userMap[u.id] = { name: u.name, initials: u.initials || u.name.slice(0, 2) };

    // All findings — full fields for MBR metrics
    const allFindings = await db.finding.findMany({
      select: {
        id: true,
        severity: true,
        status: true,
        projectId: true,
        assigneeId: true,
        cvss: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Findings with assetOwner + project endDate for asset owner stats
    const findingsForOwners = await db.$queryRawUnsafe<{
      id: string; severity: string; status: string; projectId: string;
      assetOwner: string; projectEndDate: string; projectAssetOwners: string;
    }[]>(`
      SELECT f.id, f.severity, f.status, f."projectId",
             COALESCE(f."assetOwner", '') AS "assetOwner",
             p."endDate" AS "projectEndDate",
             COALESCE(p."assetOwners", '[]') AS "projectAssetOwners"
      FROM "Finding" f
      JOIN "Project" p ON p.id = f."projectId"
    `);

    // ── Global severity + status distribution ─────────────────────────────────
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

    // ── MBR metrics ───────────────────────────────────────────────────────────

    // Resolution rate
    const resolvedCount = allFindings.filter(f => f.status === 'resolved').length;
    const resolutionRate = allFindings.length > 0
      ? Math.round((resolvedCount / allFindings.length) * 100)
      : 0;

    // Average CVSS (only non-zero values)
    const cvssFindings = allFindings.filter(f => (f.cvss ?? 0) > 0);
    const avgCVSS = cvssFindings.length > 0
      ? Math.round((cvssFindings.reduce((s, f) => s + (f.cvss ?? 0), 0) / cvssFindings.length) * 10) / 10
      : 0;

    // Mean time to resolve (days): createdAt → updatedAt for resolved findings
    const resolvedFindings = allFindings.filter(f => f.status === 'resolved');
    let avgDaysToResolve = 0;
    if (resolvedFindings.length > 0) {
      const totalMs = resolvedFindings.reduce((s, f) => {
        const diff = (f.updatedAt as Date).getTime() - (f.createdAt as Date).getTime();
        return s + Math.max(0, diff);
      }, 0);
      avgDaysToResolve = Math.round(totalMs / resolvedFindings.length / (1000 * 60 * 60 * 24));
    }

    // Crit/High open (unresolved)
    const critHighOpen = allFindings.filter(
      f => (f.severity === 'critical' || f.severity === 'high') && f.status !== 'resolved'
    ).length;

    // New findings this month
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    const newFindingsThisMonth = allFindings.filter(
      f => (f.createdAt as Date) >= firstOfMonth
    ).length;

    // Last month's findings for delta
    const firstOfLastMonth = new Date(firstOfMonth);
    firstOfLastMonth.setMonth(firstOfLastMonth.getMonth() - 1);
    const newFindingsLastMonth = allFindings.filter(
      f => (f.createdAt as Date) >= firstOfLastMonth && (f.createdAt as Date) < firstOfMonth
    ).length;

    // Report delivery rate — projects with at least 1 approved report
    const approvedReports = await db.$queryRawUnsafe<{ projectId: string }[]>(
      `SELECT DISTINCT "projectId" FROM "Report" WHERE status = 'approved'`
    );
    const deliveredProjectCount = approvedReports.length;
    const reportDeliveryRate = projects.length > 0
      ? Math.round((deliveredProjectCount / projects.length) * 100)
      : 0;

    // Project completion rate
    const completedProjects = projects.filter((p: any) => p.status === 'completed').length;
    const completionRate = projects.length > 0
      ? Math.round((completedProjects / projects.length) * 100)
      : 0;

    // ── Monthly trend — last 6 months ─────────────────────────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [monthlyNew, monthlyResolved] = await Promise.all([
      db.$queryRawUnsafe<{ month: string; count: bigint }[]>(`
        SELECT TO_CHAR("createdAt", 'YYYY-MM') AS month, COUNT(*) AS count
        FROM "Finding"
        WHERE "createdAt" >= $1
        GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
        ORDER BY month ASC
      `, sixMonthsAgo),
      db.$queryRawUnsafe<{ month: string; count: bigint }[]>(`
        SELECT TO_CHAR("updatedAt", 'YYYY-MM') AS month, COUNT(*) AS count
        FROM "Finding"
        WHERE status = 'resolved' AND "updatedAt" >= $1
        GROUP BY TO_CHAR("updatedAt", 'YYYY-MM')
        ORDER BY month ASC
      `, sixMonthsAgo),
    ]);

    // Build full 6-month label list
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const newMap: Record<string, number> = {};
    for (const r of monthlyNew) newMap[r.month] = Number(r.count);
    const resolvedMap: Record<string, number> = {};
    for (const r of monthlyResolved) resolvedMap[r.month] = Number(r.count);

    const monthlyTrend = months.map(m => ({
      month: m,
      label: new Date(m + '-01').toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      newFindings: newMap[m] || 0,
      resolved: resolvedMap[m] || 0,
    }));

    // ── Per-project rows with snapshots ──────────────────────────────────────
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
        `SELECT id FROM "ProjectSnapshot" WHERE "projectId" = $1 AND DATE("snapshotDate") = $2`,
        project.id, today
      );
      if (!existing) {
        await db.$executeRawUnsafe(
          `INSERT INTO "ProjectSnapshot" (id, "projectId", "snapshotDate", "criticalCount", "highCount", "mediumCount", "lowCount", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          uuidv4(), project.id, new Date().toISOString(),
          m.critical, m.high, m.medium, m.low, new Date().toISOString()
        );
      }

      // Project-level resolution rate
      const projTotal = project._count.findings;
      const projResolved = s.resolved || 0;
      const projResRate = projTotal > 0 ? Math.round((projResolved / projTotal) * 100) : 0;

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
        resolutionRate: projResRate,
      };
    }));

    // 7-day trend snapshots
    const trendRows = await db.$queryRawUnsafe<any[]>(
      `SELECT "projectId", "snapshotDate", "criticalCount", "highCount", "mediumCount", "lowCount"
       FROM "ProjectSnapshot"
       WHERE "snapshotDate" >= NOW() - INTERVAL '7 days'
       ORDER BY "snapshotDate" ASC`
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

    // ── Asset Owner stats ─────────────────────────────────────────────────────
    // Attribution: finding.assetOwner if set, else project.assetOwners[0], else "Unattributed"
    const today = new Date().toISOString().split('T')[0];
    const ownerStats: Record<string, {
      name: string; total: number; unresolved: number;
      critHighOpen: number; overdue: number; projectIds: Set<string>;
    }> = {};

    function ensureOwner(name: string) {
      if (!ownerStats[name]) {
        ownerStats[name] = { name, total: 0, unresolved: 0, critHighOpen: 0, overdue: 0, projectIds: new Set() };
      }
    }

    for (const f of findingsForOwners) {
      // Determine which owner gets this finding
      let ownerName = (f.assetOwner || '').trim();
      if (!ownerName) {
        // Fall back to first project asset owner
        try {
          const arr = JSON.parse(f.projectAssetOwners) as string[];
          ownerName = arr[0]?.trim() || '';
        } catch { ownerName = ''; }
      }
      if (!ownerName) ownerName = 'Unattributed';

      ensureOwner(ownerName);
      const o = ownerStats[ownerName];
      o.total++;
      o.projectIds.add(f.projectId);
      const isUnresolved = f.status !== 'resolved' && f.status !== 'accepted';
      if (isUnresolved) {
        o.unresolved++;
        const isCritHigh = f.severity === 'critical' || f.severity === 'high';
        if (isCritHigh) o.critHighOpen++;
        // Overdue: project end date passed and finding still open
        if (f.projectEndDate && f.projectEndDate < today) o.overdue++;
      }
    }

    const assetOwnerStats = Object.values(ownerStats)
      .map(o => ({ ...o, projectCount: o.projectIds.size, projectIds: Array.from(o.projectIds) }))
      .sort((a, b) => b.unresolved - a.unresolved || b.critHighOpen - a.critHighOpen);

    return NextResponse.json({
      summary: {
        totalProjects: projects.length,
        activeProjects: projects.filter((p: any) => p.status === 'in-progress').length,
        completedProjects,
        completionRate,
        totalFindings: allFindings.length,
        resolvedCount,
        resolutionRate,
        critHighOpen,
        avgCVSS,
        avgDaysToResolve,
        newFindingsThisMonth,
        newFindingsLastMonth,
        reportDeliveryRate,
        deliveredProjectCount,
        severityDistribution: severityCounts,
        statusDistribution: statusCounts,
      },
      projects: projectRows,
      teamWorkload,
      trends: trendRows,
      monthlyTrend,
      assetOwnerStats,
    });
  } catch (error) {
    console.error('[GET /api/portfolio-dashboard]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
