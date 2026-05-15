'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, Ico } from '@/components/chrome/icons';
import { StatusPill } from '@/components/ui/SevBadge';
import { StaggerList } from '@/components/anim/animate';

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
  resolutionRate: number;
}

interface MonthlyPoint {
  month: string;
  label: string;
  newFindings: number;
  resolved: number;
}

interface AssetOwnerStat {
  name: string;
  total: number;
  unresolved: number;
  critHighOpen: number;
  overdue: number;
  projectCount: number;
}

interface DashboardData {
  summary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    completionRate: number;
    totalFindings: number;
    resolvedCount: number;
    resolutionRate: number;
    critHighOpen: number;
    avgCVSS: number;
    avgDaysToResolve: number;
    newFindingsThisMonth: number;
    newFindingsLastMonth: number;
    reportDeliveryRate: number;
    deliveredProjectCount: number;
    severityDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
  };
  projects: ProjectRow[];
  teamWorkload: WorkloadEntry[];
  monthlyTrend: MonthlyPoint[];
  assetOwnerStats: AssetOwnerStat[];
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

// Radial progress ring
function RingGauge({ value, max = 100, color, size = 64 }: { value: number; max?: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ * Math.min(value / max, 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={7} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
}

// Mini delta badge (MoM change)
function Delta({ current, prev, invertColor }: { current: number; prev: number; invertColor?: boolean }) {
  if (prev === 0 && current === 0) return null;
  const diff = current - prev;
  if (diff === 0) return <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 5 }}>—</span>;
  const up = diff > 0;
  // For "new findings", more = bad (red). For "resolved", more = good (green). invertColor flips.
  const good = invertColor ? up : !up;
  return (
    <span style={{
      fontSize: 10, marginLeft: 5, fontFamily: 'var(--font-mono)',
      color: good ? 'var(--status-resolved)' : 'var(--sev-high)',
    }}>
      {up ? '▲' : '▼'}{Math.abs(diff)}
    </span>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  label, value, sub, color = 'var(--ink-0)', isText = false, ring, delta,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  isText?: boolean;
  ring?: { value: number; color: string };
  delta?: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-0)', padding: '18px 20px', display: 'flex', gap: 14, alignItems: ring ? 'center' : 'flex-start', flexDirection: ring ? 'row' : 'column' }}>
      {ring && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <RingGauge value={ring.value} color={ring.color} size={60} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: ring.color,
          }}>
            {ring.value}%
          </div>
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div className="eyebrow" style={{ marginBottom: 6, fontSize: 9 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <div style={{
            fontSize: isText ? 20 : 26, fontWeight: 700,
            fontFamily: isText ? 'var(--font-sans)' : 'var(--font-mono)',
            color, letterSpacing: isText ? '-0.01em' : '-0.03em', lineHeight: 1,
          }}>{value}</div>
          {delta}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Monthly trend bar chart ───────────────────────────────────────────────────

function MonthlyTrendChart({ data }: { data: MonthlyPoint[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.newFindings, d.resolved]), 1);
  return (
    <div className="card" style={{ padding: 'var(--card-pad)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 2 }}>Monthly Finding Velocity</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>New vs resolved over the last 6 months</div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { color: 'var(--sev-high)', label: 'New' },
            { color: 'var(--status-resolved)', label: 'Resolved' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
              <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 100 }}>
        {data.map(d => (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
              {/* New findings bar */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 80 }}>
                {d.newFindings > 0 && (
                  <div title={`${d.newFindings} new`} style={{
                    width: 14, background: 'var(--sev-high)', borderRadius: '3px 3px 0 0',
                    height: `${(d.newFindings / maxVal) * 80}px`,
                    opacity: 0.85,
                    transition: 'height 0.5s ease',
                  }} />
                )}
                {d.newFindings === 0 && <div style={{ width: 14, height: 2, background: 'var(--bg-3)', borderRadius: 2 }} />}
              </div>
              {/* Resolved bar */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 80 }}>
                {d.resolved > 0 && (
                  <div title={`${d.resolved} resolved`} style={{
                    width: 14, background: 'var(--status-resolved)', borderRadius: '3px 3px 0 0',
                    height: `${(d.resolved / maxVal) * 80}px`,
                    opacity: 0.8,
                    transition: 'height 0.5s ease',
                  }} />
                )}
                {d.resolved === 0 && <div style={{ width: 14, height: 2, background: 'var(--bg-3)', borderRadius: 2 }} />}
              </div>
            </div>
            <span style={{ fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.label}</span>
          </div>
        ))}
      </div>
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

  const { summary, projects, teamWorkload, monthlyTrend, assetOwnerStats = [] } = data;
  const dist = summary.severityDistribution;
  const statusDist = summary.statusDistribution;
  const totalF = summary.totalFindings || 1;
  const globalRisk = riskScore(dist, summary.totalFindings);
  const riskLabel = globalRisk >= 8 ? 'Critical' : globalRisk >= 5 ? 'High' : globalRisk >= 2 ? 'Medium' : 'Low';
  const riskColor = globalRisk >= 8 ? 'var(--sev-critical)' : globalRisk >= 5 ? 'var(--sev-high)' : globalRisk >= 2 ? 'var(--sev-medium)' : 'var(--status-resolved)';

  const openFindings = (statusDist.open || 0) + (statusDist['in-progress'] || 0);

  // Sort projects by risk
  const sortedProjects = [...projects].sort((a, b) =>
    riskScore(b.metrics, b.findingCount) - riskScore(a.metrics, a.findingCount)
  );

  // MoM velocity delta
  const velocityDelta = summary.newFindingsThisMonth - summary.newFindingsLastMonth;

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Row 1: Delivery & Activity KPIs ── */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10, paddingLeft: 2 }}>Monthly Business Review</div>
        <StaggerList step={70} duration={460} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--line-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <KpiTile
            label="Resolution Rate"
            value={`${summary.resolutionRate}%`}
            sub={`${summary.resolvedCount} of ${summary.totalFindings} resolved`}
            color={summary.resolutionRate >= 70 ? 'var(--status-resolved)' : summary.resolutionRate >= 40 ? 'var(--sev-medium)' : 'var(--sev-high)'}
            ring={{ value: summary.resolutionRate, color: summary.resolutionRate >= 70 ? 'var(--status-resolved)' : summary.resolutionRate >= 40 ? 'var(--sev-medium)' : 'var(--sev-high)' }}
          />
          <KpiTile
            label="Report Delivery Rate"
            value={`${summary.reportDeliveryRate}%`}
            sub={`${summary.deliveredProjectCount} of ${summary.totalProjects} projects`}
            color={summary.reportDeliveryRate >= 70 ? 'var(--status-resolved)' : 'var(--sev-medium)'}
            ring={{ value: summary.reportDeliveryRate, color: summary.reportDeliveryRate >= 70 ? 'var(--status-resolved)' : 'var(--sev-medium)' }}
          />
          <KpiTile
            label="Project Completion Rate"
            value={`${summary.completionRate}%`}
            sub={`${summary.completedProjects} completed · ${summary.activeProjects} active`}
            color={summary.completionRate >= 60 ? 'var(--status-resolved)' : 'var(--ink-0)'}
            ring={{ value: summary.completionRate, color: summary.completionRate >= 60 ? 'var(--status-resolved)' : 'var(--sev-medium)' }}
          />
          <KpiTile
            label="New This Month"
            value={summary.newFindingsThisMonth}
            sub={`vs ${summary.newFindingsLastMonth} last month`}
            color="var(--ink-0)"
            delta={<Delta current={summary.newFindingsThisMonth} prev={summary.newFindingsLastMonth} invertColor={false} />}
          />
        </StaggerList>
      </div>

      {/* ── Row 2: Risk & Performance KPIs ── */}
      <StaggerList step={70} duration={460} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--line-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <KpiTile
          label="Portfolio Risk Score"
          value={riskLabel}
          sub={`${globalRisk.toFixed(1)} / 10 composite`}
          color={riskColor}
          isText
        />
        <KpiTile
          label="Crit / High Open"
          value={summary.critHighOpen}
          sub={summary.critHighOpen > 0 ? 'require immediate attention' : 'none outstanding'}
          color={summary.critHighOpen > 0 ? 'var(--sev-critical)' : 'var(--status-resolved)'}
        />
        <KpiTile
          label="Avg CVSS Score"
          value={summary.avgCVSS > 0 ? summary.avgCVSS.toFixed(1) : '—'}
          sub={summary.avgCVSS >= 7 ? 'High avg severity' : summary.avgCVSS >= 4 ? 'Medium avg severity' : summary.avgCVSS > 0 ? 'Low avg severity' : 'No scored findings'}
          color={summary.avgCVSS >= 7 ? 'var(--sev-high)' : summary.avgCVSS >= 4 ? 'var(--sev-medium)' : 'var(--ink-0)'}
        />
        <KpiTile
          label="Mean Time to Resolve"
          value={summary.avgDaysToResolve > 0 ? `${summary.avgDaysToResolve}d` : '—'}
          sub={summary.avgDaysToResolve > 0 ? `avg days from open to resolved` : 'No resolved findings'}
          color={summary.avgDaysToResolve > 30 ? 'var(--sev-high)' : summary.avgDaysToResolve > 14 ? 'var(--sev-medium)' : 'var(--status-resolved)'}
          isText
        />
      </StaggerList>

      {/* ── Row 3: Monthly trend + Severity dist ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        {monthlyTrend.length > 0 && <MonthlyTrendChart data={monthlyTrend} />}

        {/* Severity distribution */}
        <div className="card" style={{ padding: 'var(--card-pad)' }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Severity Distribution</div>

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
      </div>

      {/* ── Row 4: Finding status + Team workload ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Finding status */}
        <div className="card" style={{ padding: 'var(--card-pad)' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Finding Status Breakdown</div>
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
          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
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
          <div style={{ paddingTop: 14, borderTop: '1px solid var(--line-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Open exposure (open + in-progress)</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: openFindings > 0 ? 'var(--sev-medium)' : 'var(--status-resolved)' }}>
                {openFindings}
              </span>
            </div>
          </div>
        </div>

        {/* Team workload */}
        <div className="card" style={{ padding: 'var(--card-pad)' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Team Workload</div>
          {teamWorkload.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '16px 0' }}>No assignments yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teamWorkload.slice(0, 6).map(u => {
                const maxCount = teamWorkload[0].count || 1;
                return (
                  <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={u.name} size={22} />
                    <span style={{ fontSize: 12, color: 'var(--ink-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                    <div style={{ width: 90, height: 4, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{ width: `${(u.count / maxCount) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 100 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)', width: 24, textAlign: 'right' }}>{u.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Asset Owner Risk Table ── */}
      {assetOwnerStats.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Asset Owner Risk Dashboard</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Unresolved findings grouped by asset owner · "Unattributed" = findings with no asset owner set
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Asset Owner</th>
                <th style={{ width: 90, textAlign: 'center' }}>Total</th>
                <th style={{ width: 100, textAlign: 'center' }}>Unresolved</th>
                <th style={{ width: 100, textAlign: 'center' }}>Crit / High</th>
                <th style={{ width: 80, textAlign: 'center' }}>Overdue</th>
                <th style={{ width: 90, textAlign: 'center' }}>Projects</th>
                <th style={{ width: 140 }}>Exposure</th>
              </tr>
            </thead>
            <tbody>
              {assetOwnerStats.map(owner => {
                const isUnattributed = owner.name === 'Unattributed';
                const exposurePct = owner.total > 0 ? (owner.unresolved / owner.total) * 100 : 0;
                return (
                  <tr key={owner.name}>
                    <td>
                      <span style={{
                        fontWeight: 500, fontSize: 13,
                        color: isUnattributed ? 'var(--ink-3)' : 'var(--ink-0)',
                        fontStyle: isUnattributed ? 'italic' : 'normal',
                      }}>
                        {owner.name}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>
                        {owner.total}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                        color: owner.unresolved > 0 ? 'var(--sev-medium)' : 'var(--status-resolved)',
                      }}>
                        {owner.unresolved}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {owner.critHighOpen > 0 ? (
                        <span style={{
                          fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          color: 'var(--sev-critical)', background: 'var(--sev-critical-bg)',
                          padding: '2px 8px', borderRadius: 100,
                          border: '1px solid rgba(255,92,58,0.2)',
                        }}>{owner.critHighOpen}</span>
                      ) : (
                        <span style={{ color: 'var(--status-resolved)', fontSize: 13 }}>✓</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {owner.overdue > 0 ? (
                        <span style={{
                          fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          color: 'var(--sev-high)', background: 'var(--sev-high-bg)',
                          padding: '2px 8px', borderRadius: 100,
                        }}>{owner.overdue}</span>
                      ) : (
                        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>
                        {owner.projectCount}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', height: 4, borderRadius: 100, overflow: 'hidden', background: 'var(--bg-3)' }}>
                          <div style={{
                            width: `${exposurePct}%`, height: '100%',
                            background: exposurePct > 70 ? 'var(--sev-high)' : exposurePct > 40 ? 'var(--sev-medium)' : 'var(--status-resolved)',
                            borderRadius: 100,
                          }} />
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
                          {exposurePct.toFixed(0)}% exposed
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line-1)', background: 'var(--bg-0)' }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              <strong>Overdue</strong> = unresolved findings where the project end date has passed ·{' '}
              <strong>Unattributed</strong> = no asset owner set on finding or project
            </span>
          </div>
        </div>
      )}

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
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 200 }}>Severity breakdown</th>
                <th style={{ width: 70, textAlign: 'center' }}>Total</th>
                <th style={{ width: 80, textAlign: 'center' }}>Crit/High</th>
                <th style={{ width: 80, textAlign: 'center' }}>Resolved</th>
                <th style={{ width: 110 }}>Lead</th>
                <th style={{ width: 70 }}>Risk</th>
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
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: p.resolutionRate >= 70 ? 'var(--status-resolved)' : 'var(--ink-2)' }}>
                          {p.resolutionRate}%
                        </span>
                        <div style={{ width: 36, height: 3, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                          <div style={{ width: `${p.resolutionRate}%`, height: '100%', background: p.resolutionRate >= 70 ? 'var(--status-resolved)' : 'var(--sev-medium)', borderRadius: 100 }} />
                        </div>
                      </div>
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

      {/* ── Full team workload table (if more than 6) ── */}
      {teamWorkload.length > 6 && (
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
