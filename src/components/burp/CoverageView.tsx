'use client';

/**
 * CoverageView — the coverage report: how much of the endpoint inventory and
 * checklist has been tested, per-category breakdown, untouched endpoints, and
 * carry-over finding awareness from the previous engagement.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';

interface Coverage {
  summary: {
    endpoints: number; testedEndpoints: number; untestedEndpoints: number; coveragePct: number;
    checklistTotal: number; checklistTested: number; checklistFailed: number; checklistUntested: number;
  };
  categories: Array<{ category: string; total: number; tested: number; succeeded: number; failed: number; untested: number }>;
  untestedEndpoints: Array<{ method: string; host: string; path: string; hitCount: number }>;
  carryover: Array<{ code: string; title: string; severity: string; trafficSince: number }>;
}

export function CoverageView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/coverage`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load coverage');
      setData(d);
    } catch (e) {
      toast.error('Couldn\'t load coverage', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div style={{ color: 'var(--ink-3)', fontSize: 12.5, padding: 20 }}>Loading coverage…</div>;
  if (!data) return null;

  const s = data.summary;
  const barColor = s.coveragePct >= 70 ? 'var(--status-resolved)' : s.coveragePct >= 40 ? 'var(--sev-medium)' : 'var(--sev-critical)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: barColor }}>{s.coveragePct}%</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }}>endpoint<br />coverage</span>
          </div>
          <div style={{ marginTop: 8, height: 4, borderRadius: 100, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{ width: `${s.coveragePct}%`, height: '100%', background: barColor }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>{s.testedEndpoints} of {s.endpoints} endpoints have ≥1 tested checklist item</div>
        </div>
        <StatCard label="Checklist tested" value={s.checklistTested} sub={`of ${s.checklistTotal} items`} color="var(--status-resolved)" />
        <StatCard label="Checklist untested" value={s.checklistUntested} sub="remaining" color="var(--ink-2)" />
        <StatCard label="Failed attempts" value={s.checklistFailed} sub="→ use AI bypass" color="var(--sev-critical)" />
        <StatCard label="Untouched endpoints" value={s.untestedEndpoints} sub="no checklist activity" color={s.untestedEndpoints > 0 ? 'var(--sev-medium)' : 'var(--status-resolved)'} />
      </div>

      {/* Categories */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}>
          <div className="eyebrow" style={{ marginBottom: 2 }}>Checklist coverage by category</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Where the test plan stands per technique class</div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Category</th>
              <th style={{ width: 80 }}>Total</th>
              <th style={{ width: 90 }}>Tested</th>
              <th style={{ width: 90 }}>Succeeded</th>
              <th style={{ width: 80 }}>Failed</th>
              <th style={{ width: 160 }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-3)' }}>Generate a checklist first.</td></tr>}
            {data.categories.map(c => {
              const pct = c.total > 0 ? Math.round((c.tested / c.total) * 100) : 0;
              return (
                <tr key={c.category}>
                  <td style={{ fontSize: 12.5, color: 'var(--ink-0)', textTransform: 'capitalize' }}>{c.category}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.total}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--ink-1)' }}>{c.tested}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--status-resolved)' }}>{c.succeeded}</td>
                  <td className="mono" style={{ fontSize: 12, color: c.failed > 0 ? 'var(--sev-critical)' : 'var(--ink-3)' }}>{c.failed}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 5, borderRadius: 100, background: 'var(--bg-3)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 70 ? 'var(--status-resolved)' : pct >= 40 ? 'var(--sev-medium)' : 'var(--sev-critical)' }} />
                      </div>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', width: 34, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Untested endpoints */}
      {data.untestedEndpoints.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Untouched endpoints ({data.untestedEndpoints.length})</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>High-traffic endpoints with zero checklist activity — likely gaps</div>
          </div>
          <table className="tbl">
            <thead><tr><th style={{ width: 70 }}>Method</th><th>Endpoint</th><th style={{ width: 80 }}>Hits</th></tr></thead>
            <tbody>
              {data.untestedEndpoints.slice(0, 50).map((e, i) => (
                <tr key={i}>
                  <td><span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: e.method === 'GET' ? '#5B9BD5' : '#4CAF7D' }}>{e.method}</span></td>
                  <td><span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)' }}>{e.host}{e.path}</span></td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{e.hitCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Carry-over awareness */}
      {data.carryover.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Carry-over findings from previous engagement</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Still unresolved last time — is there any fresh traffic on their assets?</div>
          </div>
          <table className="tbl">
            <thead><tr><th style={{ width: 80 }}>Code</th><th>Title</th><th style={{ width: 90 }}>Severity</th><th style={{ width: 130 }}>Traffic since</th></tr></thead>
            <tbody>
              {data.carryover.map(f => (
                <tr key={f.code}>
                  <td><span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{f.code}</span></td>
                  <td style={{ fontSize: 12.5, color: 'var(--ink-0)' }}>{f.title}</td>
                  <td><span className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', color: `var(--sev-${f.severity})` }}>{f.severity}</span></td>
                  <td>
                    {f.trafficSince > 0 ? (
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--status-resolved)' }}>{f.trafficSince} captured</span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>none observed</span>
                    )}
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

function StatCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{value}</div>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
