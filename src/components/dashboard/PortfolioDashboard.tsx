'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, Ico } from '@/components/chrome/icons';
import { StatusPill } from '@/components/ui/SevBadge';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkloadEntry { userId: string; name: string; initials: string; count: number; }

interface ProjectRow {
  projectId: string;
  projectName: string;
  projectCode: string;
  engagement: string;
  status: string;
  progress: number;
  lead: { name: string; initials: string } | null;
  findingCount: number;
  reportCount: number;
  metrics: { critical: number; high: number; medium: number; low: number; info: number };
  statusBreakdown: { open: number; 'in-progress': number; resolved: number };
  workload: WorkloadEntry[];
}

interface DashboardData {
  summary: {
    totalProjects: number;
    totalFindings: number;
    severityDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
  };
  projects: ProjectRow[];
  teamWorkload: WorkloadEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;
const SEV_COLORS: Record<string, string> = {
  critical: 'var(--sev-critical)',
  high:     'var(--sev-high)',
  medium:   'var(--sev-medium)',
  low:      'var(--sev-low)',
  info:     'var(--sev-info)',
};

function riskScore(metrics: Record<string, number>, total: number): number {
  if (total === 0) return 0;
  const weighted = (metrics.critical || 0) * 10 + (metrics.high || 0) * 7 +
    (metrics.medium || 0) * 4 + (metrics.low || 0) * 1;
  return Math.min(10, weighted / Math.max(total, 1));
}

function RiskDot({ score }: { score: number }) {
  const color = score >= 8 ? 'var(--sev-critical)' : score >= 5 ? 'var(--sev-high)' : score >= 2 ? 'var(--sev-medium)' : 'var(--status-resolved)';
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
      boxShadow: `0 0 5px ${color}`,
    }} />
  );
}

function SevStrip({ metrics, total }: { metrics: Record<string, number>; total: number }) {
  if (total === 0) return <div style={{ height: 4, borderRadius: 100, background: 'var(--bg-3)' }} />;
  return (
    <div style={{ display: 'flex', height: 4, borderRadius: 100, overflow: 'hidden', background: 'var(--bg-3)' }}>
      {SEV_ORDER.filter(s => (metrics[s] || 0) > 0).map(s => (
        <div key={s} title={`${metrics[s]} ${s}`}
          style={{ width: `${((metrics[s] || 0) / total) * 100}%`, background: SEV_COLORS[s] }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PortfolioDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch('/api/portfolio-dashboard');
      if (!res.ok) throw new Error('Failed to fetch portfolio data');
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, color: 'var(--ink-3)', gap: 10 }}>
      <Ico name="circle" size={16} style={{ opacity: 0.4 }} />
      <span style={{ fontSize: 13 }}>Loading portfolio…</span>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--sev-critical)', fontSize: 13 }}>
      <Ico name="alert" size={14} style={{ marginRight: 8 }} /> {error}
    </div>
  );

  if (!data) return null;

  const { summary, projects, teamWorkload } = data;
  const dist = summary.severityDistribution;
  const statusDist = summary.statusDistribution;
  const totalF = summary.totalFindings || 1;
  const globalRisk = riskScore(dist, summary.totalFindings);
  const riskLabel = globalRisk >= 8 ? 'Critical' : globalRisk >= 5 ? 'High' : globalRisk >= 2 ? 'Medium' : 'Low';
  const riskColor = globalRisk >= 8 ? 'var(--sev-critical)' : globalRisk >= 5 ? 'var(--sev-high)' : globalRisk >= 2 ? 'var(--sev-medium)' : 'var(--status-resolved)';

  const openFindings = (statusDist.open || 0) + (statusDist['in-progress'] || 0);
  const critHigh = (dist.critical || 0) + (dist.high || 0);

  // Sort projects by risk
  const sortedProjects = [...projects].sort((a, b) =>
    riskScore(b.metrics, b.findingCount) - riskScore(a.metrics, a.findingCount)
  );

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Top KPI strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--line-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        {[
          { label: 'Total Projects',     value: summary.totalProjects, sub: `${projects.filter(p => p.status === 'in-progress').length} active`, color: 'var(--ink-0)' },
          { label: 'Total Findings',     value: summary.totalFindings, sub: `${openFindings} open`, color: 'var(--ink-0)' },
          { label: 'Crit / High',        value: critHigh, sub: critHigh > 0 ? 'require attention' : 'none open', color: critHigh > 0 ? 'var(--sev-critical)' : 'var(--status-resolved)' },
          { label: 'Portfolio Risk',     value: riskLabel, sub: `${globalRisk.toFixed(1)} / 10`, color: riskColor, isText: true },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-0)', padding: '18px 20px' }}>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 9 }}>{s.label}</div>
            <div style={{
              fontSize: s.isText ? 22 : 28, fontWeight: 700,
              fontFamily: s.isText ? 'var(--font-sans)' : 'var(--font-mono)',
              color: s.color, letterSpacing: s.isText ? '-0.01em' : '-0.03em', lineHeight: 1,
            }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 5 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Two column: Severity dist + Status dist ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Severity distribution */}
        <div className="card" style={{ padding: 'var(--card-pad)' }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Severity Distribution</div>

          {/* Visual stacked bar */}
          <div style={{ display: 'flex', height: 10, borderRadius: 100, overflow: 'hidden', background: 'var(--bg-3)', marginBottom: 18 }}>
            {SEV_ORDER.filter(s => (dist[s] || 0) > 0).map(s => (
              <div key={s} title={`${dist[s]} ${s}`}
                style={{ width: `${((dist[s] || 0) / totalF) * 100}%`, background: SEV_COLORS[s] }} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SEV_ORDER.map(s => {
              const count = dist[s] || 0;
              const pct = totalF > 0 ? (count / totalF) * 100 : 0;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS[s], flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--ink-1)', textTransform: 'capitalize', width: 60 }}>{s}</span>
                  <div style={{ flex: 1, height: 4, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: SEV_COLORS[s], borderRadius: 100 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-1)', fontWeight: 600, width: 30, textAlign: 'right' }}>{count}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', width: 38, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status + Team workload */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Finding status */}
          <div className="card" style={{ padding: 'var(--card-pad)' }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Finding Status</div>
            <div style={{ display: 'flex', gap: 0, height: 10, borderRadius: 100, overflow: 'hidden', background: 'var(--bg-3)', marginBottom: 16 }}>
              {[
                { key: 'resolved',     color: 'var(--status-resolved)', label: 'Resolved' },
                { key: 'in-progress',  color: 'var(--status-progress)', label: 'In Progress' },
                { key: 'open',         color: 'var(--sev-medium)',       label: 'Open' },
              ].filter(s => (statusDist[s.key] || 0) > 0).map(s => (
                <div key={s.key} title={`${statusDist[s.key]} ${s.label}`}
                  style={{ width: `${((statusDist[s.key] || 0) / totalF) * 100}%`, background: s.color }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { key: 'resolved',    label: 'Resolved',    color: 'var(--status-resolved)' },
                { key: 'in-progress', label: 'In Progress', color: 'var(--status-progress)' },
                { key: 'open',        label: 'Open',        color: 'var(--sev-medium)' },
              ].map(s => (
                <div key={s.key} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.color, letterSpacing: '-0.02em' }}>
                    {statusDist[s.key] || 0}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Team workload */}
          {teamWorkload.length > 0 && (
            <div className="card" style={{ padding: 'var(--card-pad)', flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Team Workload</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teamWorkload.slice(0, 5).map(u => {
                  const maxCount = teamWorkload[0].count || 1;
                  return (
                    <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={u.name} size={22} />
                      <span style={{ fontSize: 12, color: 'var(--ink-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                      <div style={{ width: 80, height: 4, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                        <div style={{ width: `${(u.count / maxCount) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 100 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', width: 22, textAlign: 'right' }}>{u.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Project risk matrix ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Project Risk Matrix</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Sorted by composite risk score · highest first</div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => load(true)}
            disabled={refreshing}
            style={{ gap: 5 }}
          >
            <Ico name="arrow" size={12} style={{ opacity: refreshing ? 0.4 : 1 }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {sortedProjects.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            No projects yet
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Code</th>
                <th>Project</th>
                <th style={{ width: 120 }}>Type</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 220 }}>Severity breakdown</th>
                <th style={{ width: 80, textAlign: 'center' }}>Findings</th>
                <th style={{ width: 80, textAlign: 'center' }}>Crit/High</th>
                <th style={{ width: 110 }}>Lead</th>
                <th style={{ width: 80 }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map(p => {
                const risk = riskScore(p.metrics, p.findingCount);
                const ch = (p.metrics.critical || 0) + (p.metrics.high || 0);
                return (
                  <tr key={p.projectId}>
                    <td>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', letterSpacing: '0.05em' }}>{p.projectCode}</span>
                    </td>
                    <td>
                      <Link href={`/projects/${p.projectId}`} style={{ color: 'var(--ink-0)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
                        {p.projectName}
                      </Link>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{p.engagement || '—'}</span>
                    </td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <SevStrip metrics={p.metrics} total={p.findingCount} />
                        {p.findingCount > 0 && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            {SEV_ORDER.filter(s => (p.metrics[s] || 0) > 0).map(s => (
                              <span key={s} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: SEV_COLORS[s] }}>
                                {p.metrics[s]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>
                        {p.findingCount}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {ch > 0 ? (
                        <span style={{
                          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          color: 'var(--sev-critical)', background: 'var(--sev-critical-bg)',
                          padding: '2px 7px', borderRadius: 100,
                          border: '1px solid rgba(255,92,58,0.2)',
                        }}>{ch}</span>
                      ) : (
                        <span style={{ color: 'var(--status-resolved)', fontSize: 12 }}>✓</span>
                      )}
                    </td>
                    <td>
                      {p.lead ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Avatar name={p.lead.name} size={20} />
                          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{p.lead.name}</span>
                        </div>
                      ) : <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <RiskDot score={risk} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink-1)' }}>
                          {risk.toFixed(1)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Full team workload table (if more than 5) ── */}
      {teamWorkload.length > 5 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Full Team Workload</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Findings assigned across all projects</div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Analyst</th>
                <th style={{ width: 200 }}>Workload</th>
                <th style={{ width: 80, textAlign: 'center' }}>Findings</th>
              </tr>
            </thead>
            <tbody>
              {teamWorkload.map(u => (
                <tr key={u.userId}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={u.name} size={24} />
                      <span style={{ fontSize: 13, color: 'var(--ink-0)', fontWeight: 500 }}>{u.name}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{
                        width: `${(u.count / (teamWorkload[0].count || 1)) * 100}%`,
                        height: '100%', background: 'var(--accent)', borderRadius: 100,
                      }} />
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{u.count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
