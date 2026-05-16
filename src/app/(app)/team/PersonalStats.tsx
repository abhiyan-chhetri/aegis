'use client';

import React from 'react';
import { Avatar, Ico } from '@/components/chrome/icons';
import { CountUp } from '@/components/anim/animate';

interface Stats {
  totalFindings: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  avgCvss: number;
  projectsTouched: number;
  projectsLed: number;
  auditEvents: number;
  monthlyVelocity: { label: string; count: number }[];
  topCwes: { key: string; count: number }[];
}

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--sev-critical)',
  high:     'var(--sev-high)',
  medium:   'var(--sev-medium)',
  low:      'var(--sev-low)',
  info:     'var(--sev-info, #9a968c)',
};
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export function PersonalStats({ userName, stats }: { userName: string; stats: Stats }) {
  const maxMonth = Math.max(1, ...stats.monthlyVelocity.map(m => m.count));
  const totalThis6mo = stats.monthlyVelocity.reduce((a, m) => a + m.count, 0);
  const avgPerMonth = totalThis6mo / 6;

  return (
    <section className="card" style={{
      padding: 0, overflow: 'hidden', marginBottom: 24,
      border: '1px solid var(--line-1)',
    }}>
      {/* Header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 22px',
        background: 'linear-gradient(135deg, var(--bg-2) 0%, transparent 60%)',
        borderBottom: '1px solid var(--line-1)',
      }}>
        <Avatar name={userName} size={42} />
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 2 }}>Your stats — all time</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink-0)', letterSpacing: '-0.005em' }}>
            {userName}
          </div>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
        }}>
          {stats.auditEvents.toLocaleString()} platform events
        </div>
      </div>

      {/* KPI row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1,
        background: 'var(--line-1)',
      }}>
        <Kpi label="Findings discovered" value={stats.totalFindings} />
        <Kpi label="Projects led"         value={stats.projectsLed} />
        <Kpi label="Projects touched"     value={stats.projectsTouched} />
        <Kpi
          label="Avg CVSS"
          value={stats.avgCvss > 0 ? Number(stats.avgCvss.toFixed(1)) : 0}
          decimals={1}
          accent={
            stats.avgCvss >= 7 ? 'var(--sev-high)'
            : stats.avgCvss >= 4 ? 'var(--sev-medium)'
            : 'var(--ink-0)'
          }
        />
      </div>

      {/* Severity breakdown + monthly velocity side-by-side */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
        background: 'var(--line-1)',
      }}>
        {/* Severity */}
        <div style={{ padding: '18px 22px', background: 'var(--bg-1)' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>By severity</div>
          {stats.totalFindings === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              No findings yet. Pick up an open ticket from the Inbox to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SEV_ORDER.map(sev => {
                const n = stats.bySeverity[sev] || 0;
                const pct = (n / stats.totalFindings) * 100;
                return (
                  <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <span style={{
                      width: 60, fontFamily: 'var(--font-mono)', fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: SEV_COLOR[sev], fontWeight: 600,
                    }}>{sev}</span>
                    <span style={{ flex: 1, height: 8, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                      <span style={{
                        display: 'block', height: '100%',
                        width: `${pct}%`,
                        background: SEV_COLOR[sev],
                        borderRadius: 100, minWidth: n > 0 ? 4 : 0,
                        transition: 'width .35s ease',
                      }} />
                    </span>
                    <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink-0)', fontSize: 12 }}>{n}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Velocity */}
        <div style={{ padding: '18px 22px', background: 'var(--bg-1)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="eyebrow">Findings discovered · last 6 months</div>
            <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
              avg {avgPerMonth.toFixed(1)}/mo
            </div>
          </div>
          {totalThis6mo === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>No findings in the last 6 months.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 80 }}>
              {stats.monthlyVelocity.map((m, i) => {
                const h = (m.count / maxMonth) * 60;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', height: 12 }}>
                      {m.count > 0 ? m.count : ''}
                    </span>
                    <span style={{
                      width: '100%', maxWidth: 28,
                      height: Math.max(2, h),
                      background: m.count > 0 ? 'var(--accent)' : 'var(--bg-3)',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height .35s ease',
                    }} />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{m.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top CWEs you find */}
      {stats.topCwes.length > 0 && (
        <div style={{ padding: '14px 22px 16px', background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            You most often find <span style={{ color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(top 5 CWEs)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats.topCwes.map(c => (
              <span key={c.key} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 100,
                background: 'var(--bg-2)', border: '1px solid var(--line-1)',
                fontSize: 11.5, color: 'var(--ink-1)', fontFamily: 'var(--font-mono)',
              }}>
                <Ico name="alert" size={11} style={{ color: 'var(--ink-3)' }} />
                {c.key}
                <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>× {c.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, decimals, accent }: { label: string; value: number; decimals?: number; accent?: string }) {
  return (
    <div style={{ padding: '16px 22px', background: 'var(--bg-1)' }}>
      <div className="eyebrow" style={{ marginBottom: 8, fontSize: 9 }}>{label}</div>
      <CountUp
        to={value}
        duration={900}
        decimals={decimals ?? 0}
        className="serif"
        style={{
          fontSize: 28, fontWeight: 500, lineHeight: 1, display: 'inline-block',
          color: accent || 'var(--ink-0)', letterSpacing: '-0.02em',
        }}
      />
    </div>
  );
}
