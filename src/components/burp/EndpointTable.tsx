'use client';

/**
 * EndpointTable — normalized endpoint inventory derived from captured traffic,
 * with per-endpoint anomaly flags, JS-asset marks, tested counts, and a
 * "generate checklist" entry point.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { EndpointRow } from './types';

export function EndpointTable({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<EndpointRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [jsOnly, setJsOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Chunked rendering: never mount 500 rows at once — start small, grow on demand.
  const [visibleCount, setVisibleCount] = useState(100);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      if (jsOnly) sp.set('js', '1');
      if (flaggedOnly) sp.set('flagged', '1');
      const res = await fetch(`/api/projects/${projectId}/burp/endpoints?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load endpoints');
      setRows(data.endpoints || []);
      setTotal(data.total || 0);
      setVisibleCount(100);
      setShowAll(false);
    } catch (e) {
      toast.error('Couldn\'t load endpoints', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, q, jsOnly, flaggedOnly]);

  useEffect(() => { load(); }, [load]);

  const shown = showAll ? rows : rows.slice(0, visibleCount);

  const generateChecklist = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/checklist/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'both' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      toast.success(`${data.created} checklist items added`, { description: `AI: ${data.sources?.ai ?? 0} · cheatsheet: ${data.sources?.cheatsheet ?? 0}` });
    } catch (e) {
      toast.error('Checklist generation failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setGenerating(false);
    }
  };

  const analyzeEndpoint = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointIds: [id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      window.alert(data.content);
    } catch (e) {
      toast.error('Analysis failed', { description: e instanceof Error ? e.message : 'network error' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Ico name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
          <input className="input" placeholder="Search paths / hosts…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 28, width: 240, fontSize: 12 }} />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={jsOnly} onChange={e => setJsOnly(e.target.checked)} style={{ accentColor: '#e8b339' }} />
          JS assets
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} style={{ accentColor: 'var(--sev-critical)' }} />
          ⚑ Flagged
        </label>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{total} endpoints</span>
        <button className="btn btn-ghost btn-sm" onClick={generateChecklist} disabled={generating || total === 0} style={{ gap: 4, fontSize: 11 }} title="Generate the AI + cheatsheet attack checklist for all endpoints">
          <Ico name="sparkles" size={12} style={{ color: '#9b7fd4' }} />
          {generating ? 'Generating…' : 'Generate checklist'}
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Method</th>
              <th>Normalized path</th>
              <th style={{ width: 90 }}>Hits</th>
              <th style={{ width: 100 }}>Statuses</th>
              <th style={{ width: 60 }}>JS</th>
              <th style={{ width: 110 }}>Flags</th>
              <th style={{ width: 70 }}>Tested</th>
              <th style={{ width: 90 }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-3)' }}>Loading endpoints…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-3)' }}>No endpoints yet — captured traffic builds the inventory automatically.</td></tr>
            )}
            {shown.map(r => (
              <tr key={r.id}>                <td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: r.method === 'GET' ? '#5B9BD5' : r.method === 'POST' ? '#4CAF7D' : 'var(--ink-2)' }}>{r.method}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)' }}>{r.host}{r.path}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => analyzeEndpoint(r.id)}
                      title="AI deep-dive on this endpoint"
                      style={{ width: 22, padding: 0, flexShrink: 0 }}
                    >
                      <Ico name="sparkles" size={11} style={{ color: '#9b7fd4' }} />
                    </button>
                  </div>
                </td>
                <td><span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)' }}>{r.hitCount}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {r.statusCodes.slice(-5).map((s, i) => (
                      <span key={i} className="mono" style={{
                        fontSize: 9.5, padding: '0 4px', borderRadius: 3,
                        background: s >= 400 ? 'rgba(255,92,58,.1)' : 'var(--bg-2)',
                        color: s >= 500 ? 'var(--sev-critical)' : s >= 400 ? 'var(--sev-high)' : 'var(--ink-3)',
                      }}>{s}</span>
                    ))}
                  </div>
                </td>
                <td>{r.isJsAsset && <span style={{ fontSize: 10, color: '#e8b339' }}>🔍</span>}</td>
                <td>
                  {r.anomalies.length > 0 ? (
                    <span title={r.anomalies.map(a => a.label).join(' · ')} style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--sev-critical)' }}>
                      ⚑ {r.anomalies.length}
                    </span>
                  ) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 10.5, color: r.testedCount > 0 ? 'var(--status-resolved)' : 'var(--ink-3)' }}>
                    {r.testedCount}{r.succeededCount > 0 ? `/${r.succeededCount}✓` : ''}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                    {new Date(r.lastSeenAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!showAll && rows.length > visibleCount && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line-1)', textAlign: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setVisibleCount(c => c + 200)} style={{ fontSize: 11, gap: 4 }}>
              Show {Math.min(200, rows.length - visibleCount)} more ({rows.length - visibleCount} remaining)
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)} style={{ fontSize: 11, marginLeft: 8 }}>
              Show all {rows.length}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
