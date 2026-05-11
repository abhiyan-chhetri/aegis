/* eslint-disable @typescript-eslint/no-explicit-any */
import { connection } from 'next/server';
import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { MentionsList } from '@/components/dashboard/MentionsList';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { Topbar } from '@/components/chrome/Topbar';
import { Avatar, Ico } from '@/components/chrome/icons';
import { SevCounts, StatusPill } from '@/components/ui/SevBadge';
import { SeverityTrendChart } from '@/components/dashboard/SeverityTrendChart';

// ─── helpers ────────────────────────────────────────────────────────────────

function sevCounts(findings: { severity: string; status: string }[]) {
  const order = ['critical', 'high', 'medium', 'low', 'info'] as const;
  const counts: Record<string, number> = {};
  for (const sev of order) counts[sev] = findings.filter(f => f.severity === sev).length;
  return counts;
}

function openCounts(findings: { severity: string; status: string }[]) {
  const open = findings.filter(f => f.status !== 'resolved' && f.status !== 'accepted');
  return sevCounts(open);
}


// ─── server component ────────────────────────────────────────────────────────

export default async function DashboardPage() {
  await connection();
  const session = await getSession();

  const [projects, activities, reports] = await Promise.all([
    db.project.findMany({
      include: { lead: true, findings: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.activity.findMany({
      include: { user: true, project: true, finding: { select: { id: true, code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    db.report.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);

  // Reports assigned to me for review — use subqueries to avoid libsql JOIN/ALTER-TABLE-column issues
  const myReviewRows = session ? await db.$queryRawUnsafe<{ id: string; projectId: string; reviewComment: string; version: string }[]>(
    `SELECT id, "projectId", "reviewComment", version FROM "Report" WHERE "reviewerId" = $1 AND status = 'in-review'`,
    session.id
  ) : [];
  const myReviews = await Promise.all(
    (myReviewRows as any[]).map(async (r: any) => {
      const [proj] = await db.$queryRawUnsafe<{ name: string; code: string }[]>(
        `SELECT name, code FROM "Project" WHERE id = $1`, r.projectId
      );
      return { ...r, projectName: proj?.name ?? '', projectCode: proj?.code ?? '' };
    })
  );

  // My reports with a decision (approved/rejected) — same safe pattern
  const myDecisionRows = session ? await db.$queryRawUnsafe<{ id: string; projectId: string; status: string; reviewComment: string; version: string }[]>(
    `SELECT id, "projectId", status, "reviewComment", version FROM "Report" WHERE "authorId" = $1 AND status IN ('approved', 'rejected') ORDER BY "updatedAt" DESC LIMIT 5`,
    session.id
  ) : [];
  const myReportDecisions = await Promise.all(
    (myDecisionRows as any[]).map(async (r: any) => {
      const [proj] = await db.$queryRawUnsafe<{ name: string; code: string }[]>(
        `SELECT name, code FROM "Project" WHERE id = $1`, r.projectId
      );
      return { ...r, projectName: proj?.name ?? '', projectCode: proj?.code ?? '' };
    })
  );

  // Get dismissed mentions for current user
  const dismissedMentions = session ? await db.activity.findMany({
    where: {
      userId: session.id,
      action: 'dismiss_mention',
    },
    select: { target: true },
  }) : [];
  const dismissedIds = new Set(dismissedMentions.map(d => d.target));

  // Mentions: comments where I'm mentioned
  const myMentionRows = session ? await db.$queryRawUnsafe<{ id: string; content: string; mentions: string; createdAt: string; findingId: string; userId: string; userName: string; projectId: string }[]>(
    `SELECT fc.id, fc.content, fc.mentions, fc."createdAt", fc."findingId", u.id as "userId", u.name as "userName", f."projectId"
     FROM "FindingComment" fc
     JOIN "User" u ON u.id = fc."userId"
     JOIN "Finding" f ON f.id = fc."findingId"
     WHERE fc.mentions LIKE $1
     ORDER BY fc."createdAt" DESC
     LIMIT 10`,
    `%"${session.id}"%`
  ) : [];
  const myMentions = await Promise.all(
    (myMentionRows as any[]).map(async (c: any) => {
      const [finding] = await db.$queryRawUnsafe<{ title: string; projectId: string }[]>(
        `SELECT title, "projectId" FROM "Finding" WHERE id = $1`, c.findingId
      );


      const [proj] = finding ? await db.$queryRawUnsafe<{ name: string; code: string }[]>(
        `SELECT name, code FROM "Project" WHERE id = $1`, finding.projectId
      ) : [null];
      return { ...c, findingTitle: finding?.title ?? '', projectName: proj?.name ?? '', projectCode: proj?.code ?? '', projectId: c.projectId, createdAt: c.createdAt };
    })
  );

  // Filter out dismissed mentions
  const myMentionsFiltered = myMentions.filter(m => !dismissedIds.has(m.id));

  const activeProjects = projects.filter((p: any) => p.status !== 'completed');
  const allFindings = projects.flatMap((p: any) => p.findings as any[]);
  const openFindings = allFindings.filter((f: any) => f.status !== 'resolved' && f.status !== 'accepted');
  const criticalOpen = openFindings.filter((f: any) => f.severity === 'critical').length;

  // Compute finding counts per week (last 12 weeks) from actual DB
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84); // 12 * 7

  const weeklyFindings = await db.$queryRawUnsafe<{ week_start: Date; severity: string; count: bigint }[]>(`
    SELECT
      date_trunc('week', "createdAt") AS week_start,
      severity,
      COUNT(*) AS count
    FROM "Finding"
    WHERE "createdAt" >= $1
    GROUP BY week_start, severity
    ORDER BY week_start ASC
  `, twelveWeeksAgo);

  // Build 12-week grid
  const trendData: { critical: number; high: number; medium: number; low: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - w * 7);
    weekStart.setHours(0, 0, 0, 0);
    // find monday of that week
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    const weekKey = weekStart.toISOString().slice(0, 10);

    const weekRows = weeklyFindings.filter(r => {
      const d = new Date(r.week_start);
      d.setHours(0, 0, 0, 0);
      const k = d.toISOString().slice(0, 10);
      return k === weekKey;
    });

    const point = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of weekRows) {
      const n = Number(r.count);
      if (r.severity === 'critical') point.critical = n;
      else if (r.severity === 'high') point.high = n;
      else if (r.severity === 'medium') point.medium = n;
      else if (r.severity === 'low') point.low = n;
    }
    trendData.push(point);
  }

  // Team load: group by lead
  type TeamEntry = { user: any; count: number; findings: number };
  const teamLoad = (Object.values(
    projects.reduce<Record<string, TeamEntry>>((acc: Record<string, TeamEntry>, p: any) => {
      const id = p.leadId as string;
      if (!acc[id]) acc[id] = { user: p.lead, count: 0, findings: 0 };
      acc[id].count++;
      acc[id].findings += (p.findings as any[]).length;
      return acc;
    }, {})
  ) as TeamEntry[]).slice(0, 6);

  // Deadlines: projects ending soonest
  const now = new Date();
  const upcoming = (projects as any[])
    .filter((p: any) => p.status !== 'completed')
    .map((p: any) => ({ ...p, daysLeft: Math.ceil((new Date(p.endDate as string).getTime() - now.getTime()) / 86400000) }))
    .sort((a: any, b: any) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        title="Dashboard"
        breadcrumb={['Aegis', 'Dashboard']}
        actions={
          <Link href="/projects/new" className="btn btn-primary btn-sm">
            <Ico name="plus" size={13} />
            New project
          </Link>
        }
      />

      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── KPI strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KpiCard
            label="Active engagements"
            value={activeProjects.length}
            delta={`+${Math.max(0, activeProjects.length - 3)} this month`}
            icon="projects"
          />
          <KpiCard
            label="Open findings"
            value={openFindings.length}
            valueSuffix={criticalOpen > 0 ? (
              <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--sev-critical)', marginLeft: 8, fontWeight: 600 }}>
                {criticalOpen}C
              </span>
            ) : undefined}
            delta={`${criticalOpen} critical`}
            deltaColor={criticalOpen > 0 ? 'var(--sev-critical)' : undefined}
            icon="findings"
          />
          <KpiCard
            label="Critical unresolved"
            value={criticalOpen}
            delta={criticalOpen > 0 ? 'Needs attention' : 'All clear'}
            deltaColor={criticalOpen > 0 ? 'var(--sev-critical)' : 'var(--status-resolved)'}
            icon="alert"
            accentBorder={criticalOpen > 0 ? 'var(--sev-critical)' : undefined}
          />
          <KpiCard
            label="Reports generated"
            value={reports.length}
            delta="All time"
            icon="reports"
          />
        </div>

        {/* ── Main 2-col grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Active Projects table */}
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>Active Engagements</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-0)' }}>
                    {activeProjects.length} project{activeProjects.length !== 1 ? 's' : ''} in progress
                  </div>
                </div>
                <Link href="/projects" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                  View all <Ico name="chevRight" size={11} />
                </Link>
              </div>
              <div style={{ overflowX: 'auto' }}>
                {activeProjects.length === 0 ? (
                  <EmptyState icon="projects" message="No active projects" />
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Engagement</th>
                        <th>Findings</th>
                        <th style={{ width: 130 }}>Progress</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeProjects.map((p: any) => {
                        const counts = openCounts(p.findings as { severity: string; status: string }[]);
                        return (
                          <tr key={p.id}>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Link href={`/projects/${p.id}`} style={{ color: 'var(--ink-0)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
                                  {p.name}
                                </Link>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{p.code}</span>
                                  <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>·</span>
                                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.engagement}</span>
                                </div>
                              </div>
                            </td>
                            <td><SevCounts counts={counts} compact /></td>
                            <td>
                              {(() => {
                                const start = new Date(p.startDate).getTime();
                                const end = new Date(p.endDate).getTime();
                                const progress = end > start ? Math.max(0, Math.min(100, Math.round((Date.now() - start) / (end - start) * 100))) : 0;
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <div className="progress-bar">
                                      <div className="progress-fill" style={{ width: `${progress}%`, background: progress >= 80 ? 'var(--status-resolved)' : progress >= 40 ? 'var(--ink-1)' : 'var(--sev-high)' }} />
                                    </div>
                                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{progress}%</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td><StatusPill status={p.status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Severity Trend chart */}
            <SeverityTrendChart data={trendData} />

            {/* Activity Feed */}
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 3 }}>Activity Feed</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Recent changes across all projects</div>
                </div>
              </div>
              <div style={{ padding: '0 20px' }}>
                <ActivityFeed activities={activities as any} />
              </div>
            </section>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Report Activity — always visible */}
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 3 }}>Report Activity</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    Reviews &amp; decisions
                  </div>
                </div>
                <Link href="/reports" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                  All reports <Ico name="chevRight" size={11} />
                </Link>
              </div>

              {/* Pending reviews */}
              {(myReviews as any[]).length > 0 && (
                <>
                  <div style={{ padding: '6px 16px 4px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sev-low)' }}>
                      ⏳ Awaiting your review ({(myReviews as any[]).length})
                    </span>
                  </div>
                  {(myReviews as any[]).map((r: any, i: number) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--line-1)',
                      background: 'rgba(127,179,213,0.04)',
                    }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(127,179,213,0.14)', border: '1px solid rgba(127,179,213,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ico name="paper" size={12} style={{ color: 'var(--sev-low)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.projectName}
                        </div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{r.projectCode} · needs review</div>
                      </div>
                      <Link href={`/projects/${r.projectId}/report`} className="btn btn-sm" style={{ fontSize: 10, flexShrink: 0, background: 'rgba(127,179,213,0.12)', borderColor: 'rgba(127,179,213,0.3)', color: 'var(--sev-low)' }}>
                        Review
                      </Link>
                    </div>
                  ))}
                </>
              )}

              {/* My report decisions */}
              {(myReportDecisions as any[]).length > 0 && (
                <>
                  <div style={{ padding: '6px 16px 4px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
                      My submitted reports
                    </span>
                  </div>
                  {(myReportDecisions as any[]).map((r: any, i: number) => {
                    const isApproved = r.status === 'approved';
                    return (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 16px',
                        borderBottom: i < (myReportDecisions as any[]).length - 1 ? '1px solid var(--line-1)' : 'none',
                      }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 6, flexShrink: 0, marginTop: 1,
                          background: isApproved ? 'rgba(143,201,122,0.12)' : 'rgba(255,92,58,0.12)',
                          border: `1px solid ${isApproved ? 'rgba(143,201,122,0.25)' : 'rgba(255,92,58,0.25)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ico name={isApproved ? 'check' : 'x'} size={12} style={{ color: isApproved ? 'var(--status-resolved)' : 'var(--sev-critical)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--ink-0)', fontWeight: 500, lineHeight: 1.3 }}>
                            <span style={{ color: isApproved ? 'var(--status-resolved)' : 'var(--sev-critical)', marginRight: 4 }}>
                              {isApproved ? '✓ Approved' : '✗ Rejected'}
                            </span>
                            — {r.projectName}
                          </div>
                          {r.reviewComment && (
                            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, fontStyle: 'italic' }}>
                              &ldquo;{r.reviewComment}&rdquo;
                            </div>
                          )}
                          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>{r.projectCode}</div>
                        </div>
                        <Link href={`/projects/${r.projectId}/report`} className="btn btn-ghost btn-sm" style={{ fontSize: 10, flexShrink: 0 }}>
                          View
                        </Link>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Empty state */}
              {(myReviews as any[]).length === 0 && (myReportDecisions as any[]).length === 0 && (myMentionsFiltered as any[]).length === 0 && (
                <EmptyState icon="paper" message="No report activity yet" />
              )}

              {/* My mentions */}
              {(myMentionsFiltered as any[]).length > 0 && (
                <MentionsList mentions={myMentionsFiltered as any} />
              )}
            </section>

            {/* Risk Quadrant */}
            <section className="card" style={{ padding: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Risk Quadrant</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 16 }}>Likelihood × Impact</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                {([
                  { q: 'High likelihood · High impact', label: 'Critical zone', sev: 'critical', findings: allFindings.filter((f: any) => f.severity === 'critical').length },
                  { q: 'Low likelihood · High impact',  label: 'Elevated risk',  sev: 'high',     findings: allFindings.filter((f: any) => f.severity === 'high').length },
                  { q: 'High likelihood · Low impact',  label: 'Monitor',        sev: 'medium',   findings: allFindings.filter((f: any) => f.severity === 'medium').length },
                  { q: 'Low likelihood · Low impact',   label: 'Acceptable',     sev: 'low',      findings: allFindings.filter((f: any) => f.severity === 'low').length },
                ] as const).map((cell) => (
                  <div key={cell.sev} style={{
                    background: `var(--sev-${cell.sev}-bg)`,
                    border: `1px solid rgba(255,255,255,0.04)`,
                    borderRadius: 6,
                    padding: '16px 14px',
                    position: 'relative',
                  }}>
                    <div style={{ fontSize: 28, fontFamily: 'var(--font-serif)', color: `var(--sev-${cell.sev})`, fontWeight: 400, lineHeight: 1 }}>
                      {cell.findings}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: `var(--sev-${cell.sev})`, marginTop: 4 }}>{cell.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.3 }}>{cell.q}</div>
                  </div>
                ))}
              </div>
              {/* Axis labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>← Low likelihood</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>High likelihood →</span>
              </div>
            </section>

            {/* Upcoming Deadlines */}
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 3 }}>Upcoming Deadlines</div>
                </div>
                <Ico name="calendar" size={14} style={{ color: 'var(--ink-3)' }} />
              </div>
              {upcoming.length === 0 ? (
                <EmptyState icon="calendar" message="No upcoming deadlines" />
              ) : (
                <div>
                  {upcoming.map((p: any, i: number) => {
                    const isOverdue = p.daysLeft < 0;
                    const isUrgent = p.daysLeft >= 0 && p.daysLeft <= 7;
                    const daysColor = isOverdue ? 'var(--sev-critical)' : isUrgent ? 'var(--sev-high)' : 'var(--ink-2)';
                    return (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px',
                        borderBottom: i < upcoming.length - 1 ? '1px solid var(--line-1)' : 'none',
                      }}>
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg-2)', border: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 14, fontFamily: 'var(--font-serif)', color: daysColor, fontWeight: 400, lineHeight: 1 }}>
                            {isOverdue ? '!' : Math.abs(p.daysLeft)}
                          </span>
                          <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', textTransform: 'uppercase' }}>
                            {isOverdue ? 'over' : 'd'}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Link href={`/projects/${p.id}`} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-0)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </Link>
                          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                            {isOverdue ? `${Math.abs(p.daysLeft)}d overdue` : `Due ${p.endDate}`}
                          </div>
                        </div>
                        <StatusPill status={p.status} />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Team Load */}
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 3 }}>Team Load</div>
                </div>
                <Ico name="team" size={14} style={{ color: 'var(--ink-3)' }} />
              </div>
              {teamLoad.length === 0 ? (
                <EmptyState icon="team" message="No team data" />
              ) : (
                <div style={{ padding: '8px 0' }}>
                  {teamLoad.map(({ user, count, findings }: TeamEntry) => {
                    const maxCount = Math.max(...teamLoad.map((t: TeamEntry) => t.count), 1);
                    const pct = Math.round((count / maxCount) * 100);
                    return (
                      <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px' }}>
                        <Avatar name={user.name} size={26} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span style={{ fontSize: 12.5, color: 'var(--ink-0)', fontWeight: 500 }}>{user.name}</span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                              {count} proj · {findings} findings
                            </span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{
                              width: `${pct}%`,
                              background: pct >= 80 ? 'var(--sev-critical)' : pct >= 60 ? 'var(--sev-high)' : 'var(--ink-1)',
                            }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label, value, valueSuffix, delta, deltaColor, icon, accentBorder,
}: {
  label: string;
  value: number;
  valueSuffix?: React.ReactNode;
  delta?: string;
  deltaColor?: string;
  icon: string;
  accentBorder?: string;
}) {
  return (
    <div className="card" style={{
      padding: '20px 22px 18px',
      borderLeft: accentBorder ? `3px solid ${accentBorder}` : undefined,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 16, right: 18, opacity: 0.08 }}>
        <Ico name={icon} size={40} />
      </div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
        <span className="serif" style={{ fontSize: 54, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1 }}>
          {value}
        </span>
        {valueSuffix}
      </div>
      {delta && (
        <div className="mono" style={{ fontSize: 11, color: deltaColor || 'var(--ink-3)', marginTop: 8, letterSpacing: '0.02em' }}>
          {delta}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 20px', color: 'var(--ink-3)' }}>
      <Ico name={icon} size={24} />
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  );
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
