'use client';

import React, { useState, useMemo } from 'react';
import { Ico } from '@/components/chrome/icons';
import { Sev } from '@/components/ui/SevBadge';

interface Row { key: string; count: number; critical: number; high: number; medium: number; low: number; info: number; }
interface Props { cwe: Row[]; owasp: Row[]; totalFindings: number; taggedCwe: number; taggedOwasp: number; }

type Tab = 'cwe' | 'owasp';

const SEV_COLOR: Record<keyof Omit<Row, 'key' | 'count'>, string> = {
  critical: 'var(--sev-critical)',
  high:     'var(--sev-high)',
  medium:   'var(--sev-medium)',
  low:      'var(--sev-low)',
  info:     'var(--sev-info, #9a968c)',
};

const SEV_ORDER: (keyof Omit<Row, 'key' | 'count'>)[] = ['critical', 'high', 'medium', 'low', 'info'];

export function InsightsClient({ cwe, owasp, totalFindings, taggedCwe, taggedOwasp }: Props) {
  const [tab, setTab] = useState<Tab>('cwe');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState<10 | 25 | 50 | 100>(25);

  const rows = tab === 'cwe' ? cwe : owasp;
  const tagged = tab === 'cwe' ? taggedCwe : taggedOwasp;
  const coverage = totalFindings === 0 ? 0 : Math.round((tagged / totalFindings) * 100);

  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    return rows.filter(r => !t || r.key.toLowerCase().includes(t));
  }, [rows, q]);

  const topN = filtered.slice(0, limit);
  const maxCount = Math.max(1, ...topN.map(r => r.count));
  const totalTagged = topN.reduce((a, r) => a + r.count, 0);

  // Top-of-list "ring chart" — proportional pie of the top 6 categories
  const top6 = filtered.slice(0, 6);
  const otherCount = filtered.slice(6).reduce((a, r) => a + r.count, 0);
  const ringSegments = otherCount > 0
    ? [...top6.map(r => ({ key: r.key, count: r.count, color: paletteFor(r.key) })),
       { key: 'Other', count: otherCount, color: 'var(--ink-4)' }]
    : top6.map(r => ({ key: r.key, count: r.count, color: paletteFor(r.key) }));
  const ringTotal = ringSegments.reduce((a, s) => a + s.count, 0);

  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div>
        <h1 className="serif" style={{ margin: 0, fontSize: 30, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1 }}>
          {totalFindings.toLocaleString()} findings → which classes keep showing up?
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55 }}>
          Aggregate of CWE and OWASP tags across every project. Useful for scoping conversations,
          systemic-root-cause discussions, and personal upskilling targets.
        </p>
      </div>

      {/* Tabs + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line-1)' }}>
          {([
            { key: 'cwe' as Tab,   label: 'CWE',   count: cwe.length },
            { key: 'owasp' as Tab, label: 'OWASP', count: owasp.length },
          ]).map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
                  color: active ? 'var(--ink-0)' : 'var(--ink-3)',
                  fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}
              >
                {t.label}
                <span style={{
                  fontSize: 10, padding: '0 6px', borderRadius: 100,
                  background: active ? 'var(--accent)' : 'var(--bg-3)',
                  color: active ? 'var(--accent-ink, #fff)' : 'var(--ink-2)',
                }}>{t.count}</span>
                {active && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: 'var(--accent)' }} />}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ position: 'relative', minWidth: 220 }}>
          <Ico name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
          <input
            className="input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={`Filter ${tab === 'cwe' ? 'CWEs' : 'OWASP categories'}…`}
            style={{ paddingLeft: 30, height: 32, fontSize: 12.5, width: '100%' }}
          />
        </div>

        <select
          className="input"
          value={String(limit)}
          onChange={e => setLimit(parseInt(e.target.value, 10) as 10 | 25 | 50 | 100)}
          style={{ height: 32, fontSize: 12.5, width: 120 }}
        >
          <option value="10">Top 10</option>
          <option value="25">Top 25</option>
          <option value="50">Top 50</option>
          <option value="100">Top 100</option>
        </select>
      </div>

      {/* Coverage banner */}
      <div style={{
        padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)',
        borderLeft: '3px solid var(--accent)', borderRadius: 'var(--r-sm)',
        fontSize: 12, color: 'var(--ink-2)',
      }}>
        <b style={{ color: 'var(--ink-0)' }}>{tagged.toLocaleString()}</b> of {totalFindings.toLocaleString()} findings
        ({coverage}%) carry a {tab.toUpperCase()} tag.
        {coverage < 80 && <> Consider auditing untagged findings to improve trend accuracy.</>}
      </div>

      {/* Ring + Top-6 legend */}
      {topN.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '200px 1fr', gap: 28, alignItems: 'center',
          padding: '20px 24px', background: 'var(--bg-1)', border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-md)',
        }}>
          <Ring segments={ringSegments} total={ringTotal} />
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Top {tab.toUpperCase()} mix</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ringSegments.map((s) => {
                const pct = ringTotal > 0 ? (s.count / ringTotal) * 100 : 0;
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink-1)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: s.key === 'Other' ? 'var(--font-sans)' : 'var(--font-mono)' }}>{s.key}</span>
                    <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{s.count}</span>
                    <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, width: 44, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Table — sortable bar list */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 70px 1fr 110px',
          padding: '10px 16px', background: 'var(--bg-2)',
          borderBottom: '1px solid var(--line-1)',
          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
        }}>
          <span>#</span>
          <span>{tab === 'cwe' ? 'CWE' : 'OWASP'}</span>
          <span style={{ textAlign: 'right' }}>Count</span>
          <span>Volume</span>
          <span>Severity mix</span>
        </div>
        {topN.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            {q ? `No ${tab.toUpperCase()} categories match "${q}".` : `No ${tab.toUpperCase()} tags found yet — add them to your findings to populate this view.`}
          </div>
        ) : topN.map((row, i) => {
          const pct = (row.count / maxCount) * 100;
          const sevMixTotal = SEV_ORDER.reduce((a, s) => a + row[s], 0);
          return (
            <div key={row.key} style={{
              display: 'grid', gridTemplateColumns: '40px 1fr 70px 1fr 110px',
              alignItems: 'center', padding: '10px 16px',
              borderBottom: i < topN.length - 1 ? '1px solid var(--line-1)' : 'none',
              fontSize: 12.5, color: 'var(--ink-1)',
            }}>
              <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-0)', fontWeight: 600 }}>
                {row.key}
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-0)' }}>
                {row.count}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', height: 10 }}>
                <span style={{
                  display: 'inline-block',
                  width: `${pct}%`,
                  height: 8,
                  background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 50%, transparent))',
                  borderRadius: 100, minWidth: 2,
                  transition: 'width .35s ease',
                }} />
              </span>
              {/* Severity mix bar */}
              <span style={{ display: 'flex', height: 12, borderRadius: 2, overflow: 'hidden', background: 'var(--bg-3)' }}>
                {SEV_ORDER.map(sev => {
                  if (row[sev] === 0) return null;
                  const w = (row[sev] / sevMixTotal) * 100;
                  return (
                    <span
                      key={sev}
                      title={`${row[sev]} ${sev}`}
                      style={{ width: `${w}%`, background: SEV_COLOR[sev], height: '100%' }}
                    />
                  );
                })}
              </span>
            </div>
          );
        })}
        {/* Footer: total + summary */}
        {topN.length > 0 && (
          <div style={{
            padding: '10px 16px', background: 'var(--bg-1)',
            borderTop: '1px solid var(--line-1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
          }}>
            <span>Showing top {topN.length} of {filtered.length} {tab.toUpperCase()} categories</span>
            <span>{totalTagged} findings in view</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ring (donut) chart ──────────────────────────────────────────────────────
function Ring({ segments, total }: { segments: { key: string; count: number; color: string }[]; total: number }) {
  const size = 180;
  const r = 70;
  const stroke = 22;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {/* Background ring */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={stroke} />
      {/* Segments */}
      {segments.map((s, i) => {
        const len = total > 0 ? (s.count / total) * C : 0;
        const node = (
          <circle
            key={i}
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return node;
      })}
      {/* Centre label */}
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize={20} fill="var(--ink-0)" fontFamily="var(--font-serif)" fontWeight={500}>
        {total}
      </text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.06em">
        FINDINGS
      </text>
    </svg>
  );
}

// Stable colour palette keyed off the string — same key → same colour every load
const PALETTE = [
  '#7fb3d5', '#c9a8f5', '#8fc97a', '#f5a524',
  '#ff5c3a', '#e8d56b', '#3a6ea5', '#b88a18',
  '#7a4dbf', '#2f8a4c',
];
function paletteFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
