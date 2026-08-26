'use client';

/**
 * TrafficList — captured request/response browser with filters, live SSE merge,
 * a detail slide-over (request/response, anomaly flags, secrets, finding link),
 * and an AI deep-dive ("Analyze with AI").
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import type { TrafficDetail as TrafficDetailRow, TrafficRow } from './types';
import { PinsRail } from './PinsRail';

const METHOD_COLORS: Record<string, string> = {
  GET: '#5B9BD5', POST: '#4CAF7D', PUT: '#e8b339', PATCH: '#a78bfa',
  DELETE: '#ef6a5c', OPTIONS: 'var(--ink-3)', HEAD: 'var(--ink-3)',
};

function methodColor(m: string) { return METHOD_COLORS[m.toUpperCase()] || 'var(--ink-3)'; }
function statusColor(s: number) {
  if (s >= 500) return 'var(--sev-critical)';
  if (s >= 400) return 'var(--sev-high)';
  if (s >= 300) return 'var(--sev-medium)';
  return 'var(--ink-2)';
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TrafficList({ projectId, newTraffic, onAckNew, onStatsChange }: {
  projectId: string;
  newTraffic: TrafficRow[];
  onAckNew: () => void;
  onStatsChange: () => void;
}) {
  const [rows, setRows] = useState<TrafficRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ host: '', tool: '', status: '', q: '', anomaly: false, inBodies: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [mergedNew, setMergedNew] = useState<TrafficRow[]>([]);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (pageNum = page, opts = filters) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (opts.host) sp.set('host', opts.host);
      if (opts.tool) sp.set('tool', opts.tool);
      if (opts.status) sp.set('status', opts.status);
      if (opts.q) sp.set('q', opts.q);
      if (opts.anomaly) sp.set('anomaly', '1');
      if (opts.inBodies) sp.set('inBodies', '1');
      sp.set('page', String(pageNum));
      sp.set('pageSize', String(pageSize));
      const res = await fetch(`/api/projects/${projectId}/burp/traffic?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load traffic');
      setRows(data.traffic || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
    } catch (e) {
      toast.error('Couldn\'t load traffic', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, page, pageSize, filters]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1, filters); }, [projectId]);

  // Debounce filter changes
  useEffect(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => { load(1, filters); }, 400);
    return () => { if (fetchTimer.current) clearTimeout(fetchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Live merge: prepend new traffic, keep a "N new" pill until acknowledged.
  useEffect(() => {
    if (newTraffic.length > 0) {
      setMergedNew(prev => {
        const existing = new Set(prev.map(r => r.id));
        const fresh = newTraffic.filter(r => !existing.has(r.id));
        return [...fresh, ...prev].slice(0, 100);
      });
    }
  }, [newTraffic]);

  // ── Filter fix: live rows must respect the active filters, otherwise a
  //    filtered view (anomaly-only, a host, a tool…) gets polluted by
  //    unrelated rows that just streamed in. ─────────────────────────────────
  const matchesFilters = useCallback((r: TrafficRow) => {
    if (filters.anomaly && (r.anomalies || []).length === 0) return false;
    if (filters.tool && r.tool !== filters.tool) return false;
    if (filters.status && String(r.statusCode) !== filters.status) return false;
    if (filters.host && !r.url.toLowerCase().includes(filters.host.toLowerCase())) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      let hay = `${r.url}\n${r.pathNoQuery || ''}`.toLowerCase();
      if (filters.inBodies) hay += `\n${r.requestBody || ''}\n${r.responseBody || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [filters]);

  const ackNew = () => {
    // Only merge live rows that pass the CURRENT filters into the table.
    const accepted = mergedNew.filter(matchesFilters);
    const ids = new Set(accepted.map(r => r.id));
    setRows(prev => [...accepted.filter(r => !prev.some(p => p.id === r.id)), ...prev]);
    onAckNew();
    setMergedNew([]);
    setTotal(t => t + ids.size);
  };

  const visibleFilteredNew = mergedNew.filter(matchesFilters);
  const visible = visibleFilteredNew.length > 0 ? [...visibleFilteredNew, ...rows] : rows;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAnalyze = async () => {
    const trafficIds = selected.size > 0 ? [...selected] : rows.slice(0, 25).map(r => r.id);
    if (trafficIds.length === 0) { toast.error('No traffic to analyze'); return; }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trafficIds: trafficIds.slice(0, 50) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data.content);
    } catch (e) {
      toast.error('AI analysis failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Ico name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
          <input className="input" placeholder="Search url / bodies…" value={filters.q}
            onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            style={{ paddingLeft: 28, width: 220, fontSize: 12 }} />
        </div>
        <input className="input" placeholder="Host" value={filters.host}
          onChange={e => setFilters(f => ({ ...f, host: e.target.value }))}
          style={{ width: 150, fontSize: 12 }} />
        <select className="input" value={filters.tool} onChange={e => setFilters(f => ({ ...f, tool: e.target.value }))} style={{ width: 120, fontSize: 12 }}>
          <option value="">All tools</option>
          <option value="proxy">Proxy</option>
          <option value="repeater">Repeater</option>
          <option value="intruder">Intruder</option>
          <option value="scanner">Scanner</option>
          <option value="manual">Manual</option>
        </select>
        <input className="input" placeholder="Status" value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
          style={{ width: 70, fontSize: 12 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={filters.anomaly} onChange={e => setFilters(f => ({ ...f, anomaly: e.target.checked }))} style={{ accentColor: 'var(--sev-critical)' }} />
          ⚑ Anomalies only
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }} title="Slow on large captures — scans every request/response body">
          <input type="checkbox" checked={filters.inBodies} onChange={e => setFilters(f => ({ ...f, inBodies: e.target.checked }))} style={{ accentColor: '#5B9BD5' }} />
          Search bodies
        </label>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{total} captured</span>
        <button className="btn btn-ghost btn-sm" onClick={() => load(1, filters)} style={{ gap: 4, fontSize: 11 }}>
          <Ico name="history" size={12} /> Refresh
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{ gap: 4, fontSize: 11 }}
          title="AI deep-dive over the captured traffic"
        >
          <Ico name="sparkles" size={12} style={{ color: '#9b7fd4' }} />
          {analyzing ? 'Analyzing…' : 'Analyze with AI'}
        </button>
      </div>

      {/* "N new" pill */}
      {mergedNew.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(91,155,213,.1)', border: '1px solid rgba(91,155,213,.3)', borderRadius: 'var(--r-sm)', fontSize: 12, color: '#5B9BD5' }}>
          <span className="caret-pulse" style={{ width: 6, height: 6, background: '#5B9BD5', borderRadius: '50%', display: 'inline-block' }} />
          <span style={{ fontWeight: 600 }}>{visibleFilteredNew.length} new</span> request{visibleFilteredNew.length === 1 ? '' : 's'} streamed in from the Burp extension
          {visibleFilteredNew.length < mergedNew.length && (
            <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>({mergedNew.length - visibleFilteredNew.length} hidden by filters)</span>
          )}
          <button className="btn btn-sm" onClick={ackNew} style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 10px' }}>Show</button>
        </div>
      )}

      {/* AI analysis panel */}
      {analysis && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ico name="sparkles" size={13} style={{ color: '#9b7fd4' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>AI traffic analysis</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setAnalysis(null)} style={{ width: 24, padding: 0 }}>
              <Ico name="x" size={12} />
            </button>
          </div>
          <div className="md-preview" style={{ padding: '12px 16px', fontSize: 12.5, lineHeight: 1.65, maxHeight: 340, overflowY: 'auto' }}>
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              <th style={{ width: 70 }}>Method</th>
              <th>URL</th>
              <th style={{ width: 70 }}>Status</th>
              <th style={{ width: 90 }}>Tool</th>
              <th style={{ width: 80 }}>Size</th>
              <th style={{ width: 60 }}>Flags</th>
              <th style={{ width: 90 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && visible.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-3)' }}>Loading captured traffic…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-3)' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📡</div>
                No traffic captured yet. Generate an engagement key in <strong>Settings</strong>, point the Burp extension at the ingest endpoint, and traffic streams in here live.
              </td></tr>
            )}
            {visible.map(r => (
              <tr
                key={r.id}
                onClick={() => setDetail(r.id)}
                style={{ cursor: 'pointer' }}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('text/aegis-traffic', r.id);
                  e.dataTransfer.setData('text/plain', r.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <td style={{ textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleSelect(r.id); }}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} style={{ accentColor: '#5B9BD5' }} />
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: methodColor(r.method) }}>{r.method}</span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)' }}>{r.url}</span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: statusColor(r.statusCode) }}>{r.statusCode || '—'}</span>
                </td>
                <td>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: r.tool === 'repeater' || r.tool === 'intruder' ? '#a78bfa' : 'var(--ink-3)', textTransform: 'capitalize' }}>{r.tool}</span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{r.sizeBytes > 1024 ? `${(r.sizeBytes / 1024).toFixed(0)}KB` : `${r.sizeBytes}B`}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    {r.anomalies.length > 0 && (
                      <span title={r.anomalies.map(a => a.label).join(' · ')} style={{ color: 'var(--sev-critical)', fontSize: 11 }}>⚑{r.anomalies.length}</span>
                    )}
                    {r.secrets.length > 0 && (
                      <span title={`${r.secrets.length} secret${r.secrets.length === 1 ? '' : 's'}`} style={{ color: '#e8b339', fontSize: 11 }}>🔑</span>
                    )}
                    {r.findingId && <span title="Linked to a finding" style={{ color: 'var(--status-resolved)', fontSize: 11 }}>🔗</span>}
                  </div>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{fmtTime(r.createdAt)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>
            <Ico name="chevLeft" size={12} />
          </button>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{page} / {Math.ceil(total / pageSize)}</span>
          <button className="btn btn-ghost btn-sm" disabled={page * pageSize >= total} onClick={() => load(page + 1)}>
            <Ico name="chevRight" size={12} />
          </button>
        </div>
      )}

      {detail && (
        <TrafficDetail
          projectId={projectId}
          trafficId={detail}
          onClose={() => setDetail(null)}
          onChanged={onStatsChange}
          onNavigate={(tid) => setDetail(tid)}
        />
      )}
      </div>

      {/* Interesting rail — drag rows here to pin them */}
      <PinsRail projectId={projectId} />
    </div>
  );
}

// ── Detail slide-over ─────────────────────────────────────────────────────────

function TrafficDetail({ projectId, trafficId, onClose, onChanged, onNavigate }: {
  projectId: string; trafficId: string; onClose: () => void; onChanged: () => void; onNavigate?: (tid: string) => void;
}) {
  const [detail, setDetail] = useState<TrafficDetailRow | null>(null);
  const [finding, setFinding] = useState<{ id: string; code: string; title: string; severity: string } | null>(null);
  const [tab, setTab] = useState<'req' | 'res'>('req');
  const [linkMode, setLinkMode] = useState(false);
  const [findings, setFindings] = useState<Array<{ id: string; code: string; title: string; severity: string }>>([]);
  const [linkSearch, setLinkSearch] = useState('');
  const [busy, setBusy] = useState(false);
  // One-click replay + session flow + show-in-Burp
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<{ ok: boolean; queued?: boolean; viaBurp?: boolean; taskId?: string; statusCode?: number; durationMs?: number; responseHeaders?: Record<string, string>; responseBody?: string; error?: string } | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flow, setFlow] = useState<Array<{ id: string; method: string; url: string; statusCode: number; tool: string; createdAt: string }>>([]);
  const [flowMode, setFlowMode] = useState('host');
  const [showingInBurp, setShowingInBurp] = useState(false);
  const [useSession, setUseSession] = useState(true);
  const [isSession, setIsSession] = useState(false);
  const replayPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (replayPollRef.current) clearInterval(replayPollRef.current); }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}`);
      const data = await res.json();
      if (res.ok) {
        setDetail(data.traffic);
        setFinding(data.finding);
        setIsSession(Boolean(data.traffic.isSession));
      }
    } catch { /* ignore */ }
  }, [projectId, trafficId]);
  useEffect(() => { load(); }, [load]);

  const markSession = async (on: boolean) => {
    const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSession: on }),
    });
    if (res.ok) { setIsSession(on); toast.success(on ? 'Marked as the session anchor — replays will use its cookies/tokens' : 'Session anchor removed'); }
  };

  const createFindingFromFlags = async () => {
    if (!detail) return;
    const flags = detail.anomalies || [];
    const top = flags.find(f => f.severity === 'high') || flags[0];
    const title = `${top?.label || 'Observed behaviour'} on ${detail.method} ${detail.host}${detail.pathNoQuery || ''}`;
    const reproduction = [
      '## Captured request/response (auto-drafted from anomaly flags)',
      '',
      `\`${detail.method} ${detail.url}\` → **${detail.statusCode}**`,
      `Flags: ${flags.map(f => f.label).join(' · ')}`,
      '',
      '### Request',
      '```http',
      `${detail.method} ${detail.url}`,
      (detail.requestBody || '(no body)'),
      '```',
      '### Response',
      '```http',
      `HTTP ${detail.statusCode}`,
      (detail.responseBody || '(no body)').slice(0, 4000),
      '```',
      '',
      'Confirm and fill in the details.',
    ].join('\n');
    try {
      const res = await fetch(`/api/projects/${projectId}/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.slice(0, 120),
          severity: top?.severity === 'high' ? 'high' : 'medium',
          summary: `Auto-drafted from Burp Bridge anomaly flags: ${flags.map(f => f.label).join(', ')}.`,
          description: `Flagged automatically on ${detail.method} ${detail.url} (HTTP ${detail.statusCode}):\n\n- ${flags.map(f => `**${f.label}**`).join('\n- ')}\n\n_(Investigate and rewrite.)_`,
          reproduction,
          assets: [detail.host || ''],
          cvss: 0, cvssVector: '', cvssLocked: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      toast.success('Finding draft created from flags', { description: data.finding?.code || 'new finding' });
      window.open(`/projects/${projectId}/findings/${data.finding?.id || data.id}`, '_blank');
    } catch (e) {
      toast.error('Couldn\'t create finding', { description: e instanceof Error ? e.message : 'network error' });
    }
  };

  const openLinkPicker = async () => {
    setLinkMode(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      const list = (data.project?.findings || []).map((f: any) => ({
        id: f.id, code: f.code, title: f.title, severity: f.severity,
      }));
      setFindings(list);
    } catch { setFindings([]); }
  };

  const setLink = async (findingId: string | null) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId }),
      });
      if (res.ok) {
        setFinding(findingId ? findings.find(f => f.id === findingId) || null : null);
        setLinkMode(false);
        onChanged();
      }
    } finally { setBusy(false); }
  };

  const addFlag = async (type: string, label: string) => {
    const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, label, severity: 'medium' }),
    });
    if (res.ok) load();
  };

  // ── One-click replay ───────────────────────────────────────────────────────
  const replay = async () => {
    setReplaying(true);
    setReplayResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSession }),
      });
      const data = await res.json();
      if (data.queued) {
        // Server can't reach the target — queued for Burp replay. Poll the
        // task until the extension fires it from the tester's machine.
        setReplayResult({ ok: false, queued: true, taskId: data.taskId, error: data.error });
        if (replayPollRef.current) clearInterval(replayPollRef.current);
        replayPollRef.current = setInterval(async () => {
          try {
            const tr = await fetch(`/api/projects/${projectId}/burp/replay-tasks?trafficId=${trafficId}`).then(r => r.json());
            const task = (tr.tasks || []).find((t: { id: string }) => t.id === data.taskId);
            if (task && task.status !== 'pending') {
              if (replayPollRef.current) clearInterval(replayPollRef.current);
              const r = task.result || {};
              if (r.error) {
                setReplayResult({ ok: false, error: `Burp replay failed: ${r.error}` });
              } else {
                setReplayResult({
                  ok: true,
                  viaBurp: true,
                  statusCode: r.statusCode,
                  durationMs: r.durationMs,
                  responseHeaders: r.headers || {},
                  responseBody: r.body || '',
                });
              }
            }
          } catch { /* keep polling */ }
        }, 3000);
      } else if (!res.ok && !data.ok) {
        setReplayResult({ ok: false, error: data.error || `HTTP ${res.status}` });
      } else {
        setReplayResult(data);
      }
    } catch (e) {
      setReplayResult({ ok: false, error: e instanceof Error ? e.message : 'network error' });
    } finally {
      setReplaying(false);
    }
  };

  // ── Session/flow reconstruction ────────────────────────────────────────────
  const viewFlow = async () => {
    setFlowOpen(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}/flow`);
      const data = await res.json();
      if (res.ok) {
        setFlow(data.flow || []);
        setFlowMode(data.mode || 'host');
      }
    } catch { /* ignore */ }
  };

  // ── Show in Burp (extension local callback) ────────────────────────────────
  const showInBurp = async () => {
    setShowingInBurp(true);
    try {
      const cb = await fetch('/api/burp/callback').then(r => r.json()).catch(() => null);
      const base = (cb?.callbackUrl || 'http://127.0.0.1:8787').replace(/\/+$/, '');
      const params = new URLSearchParams({
        method: detail?.method || '',
        url: detail?.url || '',
        at: String(new Date(detail?.createdAt || Date.now()).getTime()),
      });
      const res = await fetch(`${base}/reveal?${params}`, { signal: AbortSignal.timeout(3000) });
      const text = await res.text();
      if (text.trim().toLowerCase() === 'opened') {
        toast.success('Opened in Burp', { description: 'The request was sent to a Repeater tab named "Aegis".' });
      } else {
        toast.error('Not found in Burp', { description: 'The extension couldn\'t find this exchange in its recent-traffic buffer.' });
      }
    } catch {
      toast.error('Burp extension offline', { description: 'Can\'t reach the extension callback (http://127.0.0.1:8787). Check the Aegis Bridge tab / Settings.' });
    } finally {
      setShowingInBurp(false);
    }
  };

  if (!detail) return null;

  const reqHeaders = detail.requestHeaders || {};
  const resHeaders = detail.responseHeaders || {};
  const headBlock = tab === 'req'
    ? Object.entries(reqHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
    : Object.entries(resHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
  const body = tab === 'req' ? detail.requestBody || '' : detail.responseBody || '';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.45)' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 91, width: 680, maxWidth: '94vw',
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line-2)', boxShadow: '-16px 0 60px rgba(0,0,0,.4)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: methodColor(detail.method) }}>{detail.method}</span>
            <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-0)', flex: 1, wordBreak: 'break-all' }}>{detail.url}</span>
            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }}><Ico name="x" size={14} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: statusColor(detail.statusCode) }}>{detail.statusCode}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{detail.contentType || 'no content-type'}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>· {detail.tool}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>· {new Date(detail.createdAt).toLocaleString('en-GB')}</span>
            {detail.truncated && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#e8b339' }}>truncated</span>}
          </div>

          {/* Anomaly flags */}
          {detail.anomalies.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {detail.anomalies.map(a => (
                <span key={a.type} title={a.label} style={{
                  fontSize: 9.5, fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: 100,
                  background: a.severity === 'high' ? 'rgba(255,92,58,.12)' : 'var(--bg-2)',
                  color: a.severity === 'high' ? 'var(--sev-critical)' : 'var(--ink-2)',
                  border: `1px solid ${a.severity === 'high' ? 'rgba(255,92,58,.3)' : 'var(--line-1)'}`,
                }}>⚑ {a.label}</span>
              ))}
            </div>
          )}

          {/* Secrets */}
          {detail.secrets.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.08em', color: '#e8b339', marginBottom: 4 }}>
                🔑 {detail.secrets.length} secret{detail.secrets.length === 1 ? '' : 's'} found
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {detail.secrets.map((s, i) => (
                  <div key={i} style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', background: 'rgba(232,179,57,.06)', border: '1px solid rgba(232,179,57,.15)', borderRadius: 'var(--r-xs)', padding: '4px 8px' }}>
                    <span style={{ color: '#e8b339' }}>{s.type}</span> <span style={{ color: 'var(--ink-0)' }}>{s.value}</span>
                    {s.context && <div style={{ color: 'var(--ink-3)', fontSize: 9.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>…{s.context}…</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Finding link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            {finding ? (
              <>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Linked to:</span>
                <a href={`/projects/${projectId}/findings/${finding.id}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>{finding.code} — {finding.title}</a>
                <button className="btn btn-ghost btn-sm" onClick={() => setLink(null)} disabled={busy} style={{ fontSize: 10, padding: '1px 8px' }}>Unlink</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={openLinkPicker} style={{ gap: 4, fontSize: 11 }}>
                <Ico name="link" size={12} />
                Link to finding
              </button>
            )}
          </div>
          {linkMode && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input className="input" placeholder="Search findings…" value={linkSearch} onChange={e => setLinkSearch(e.target.value)} style={{ fontSize: 12 }} autoFocus />
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)' }}>
                {findings.filter(f => !linkSearch || f.title.toLowerCase().includes(linkSearch.toLowerCase()) || f.code.toLowerCase().includes(linkSearch.toLowerCase())).map(f => (
                  <button key={f.id} onClick={() => setLink(f.id)} style={{
                    display: 'flex', gap: 8, width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--ink-1)', textAlign: 'left', borderBottom: '1px solid var(--line-1)',
                  }}>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{f.code}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
                    <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: `var(--sev-${f.severity})` }}>{f.severity}</span>
                  </button>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setLinkMode(false)} style={{ alignSelf: 'flex-start', fontSize: 10 }}>Cancel</button>
            </div>
          )}

          {/* Manual flag */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            {[['interesting', 'Mark interesting'], ['suspicious', 'Mark suspicious'], ['false-positive', 'Mark false positive']].map(([type, label]) => (
              <button key={type} className="btn btn-ghost btn-sm" onClick={() => addFlag(type, label)} style={{ fontSize: 10, padding: '2px 8px' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Actions: replay / flow / show in Burp / session / finding */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={replay} disabled={replaying} style={{ gap: 4, fontSize: 11 }} title="Re-send this request from the Aegis server (queues for Burp if unreachable)">
              <Ico name="replay" size={12} />
              {replaying ? 'Replaying…' : 'Replay request'}
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--ink-2)', cursor: 'pointer' }} title="Inject the project's session anchor cookies/tokens into the replay">
              <input type="checkbox" checked={useSession} onChange={e => setUseSession(e.target.checked)} style={{ accentColor: '#5B9BD5' }} />
              with session
            </label>
            <button className="btn btn-ghost btn-sm" onClick={viewFlow} style={{ gap: 4, fontSize: 11 }} title="Reconstruct the session this exchange belongs to">
              <Ico name="branch" size={12} />
              Session flow
            </button>
            <button className="btn btn-ghost btn-sm" onClick={showInBurp} disabled={showingInBurp} style={{ gap: 4, fontSize: 11 }} title="Open this exact exchange in Burp via the extension">
              <Ico name="eye" size={12} />
              {showingInBurp ? 'Locating…' : 'Show in Burp'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => markSession(!isSession)}
              style={{ gap: 4, fontSize: 11, color: isSession ? 'var(--status-resolved)' : 'var(--ink-2)' }}
              title={isSession ? 'Remove the session anchor' : 'Mark this exchange as the authenticated session anchor — replays inject its cookies/tokens'}
            >
              <Ico name="key" size={12} />
              {isSession ? '✓ session anchor' : 'Mark as session'}
            </button>
            {(detail?.anomalies?.length || 0) > 0 && (
              <button className="btn btn-sm" onClick={createFindingFromFlags} style={{ gap: 4, fontSize: 11, marginLeft: 'auto', borderColor: 'var(--sev-critical)', color: 'var(--sev-critical)' }}>
                <Ico name="sparkles" size={12} />
                Create finding from {detail?.anomalies.length} flag{detail?.anomalies.length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          {/* Replay result */}
          {replayResult && (
            <div style={{ marginTop: 8, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                {replayResult.ok ? (
                  <>
                    <span className="mono" style={{ fontWeight: 700, color: replayResult.statusCode! >= 400 ? 'var(--sev-high)' : 'var(--status-resolved)' }}>
                      {replayResult.statusCode}
                    </span>
                    {replayResult.viaBurp && (
                      <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: '#5B9BD5', background: 'rgba(91,155,213,.12)', padding: '1px 6px', borderRadius: 3 }}>VIA BURP</span>
                    )}
                    <span style={{ color: 'var(--ink-3)' }}>replayed in {replayResult.durationMs}ms</span>
                  </>
                ) : replayResult.queued ? (
                  <>
                    <span className="caret-pulse" style={{ width: 6, height: 6, background: '#e8b339', borderRadius: '50%', display: 'inline-block' }} />
                    <span style={{ color: '#e8b339' }}>Queued for Burp replay</span>
                    <span style={{ color: 'var(--ink-3)' }}>— the extension will pull it and open it in Repeater (waiting…)</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--sev-critical)' }}>✗ {replayResult.error}</span>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => { if (replayPollRef.current) clearInterval(replayPollRef.current); setReplayResult(null); }} style={{ width: 20, padding: 0 }}>
                  <Ico name="x" size={10} />
                </button>
              </div>
              {replayResult.ok && (
                <pre style={{ margin: 0, padding: 8, background: '#0F1115', color: '#D7DCE2', fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.55, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
{Object.entries(replayResult.responseHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}
{(replayResult.responseBody || '')}
                </pre>
              )}
            </div>
          )}

          {/* Session flow panel */}
          {flowOpen && (
            <div style={{ marginTop: 8, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <Ico name="branch" size={12} style={{ color: 'var(--ink-2)' }} />
                <span style={{ fontWeight: 600, color: 'var(--ink-0)' }}>
                  {flowMode === 'session' ? 'Session flow' : 'Host activity'}
                </span>
                <span style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>
                  {flowMode === 'session' ? 'chained by session fingerprint' : 'no session token captured — showing same-host requests'}
                </span>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => setFlowOpen(false)} style={{ width: 20, padding: 0 }}>
                  <Ico name="x" size={10} />
                </button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {flow.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => { if (onNavigate) { onNavigate(f.id); setFlowOpen(false); } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 'var(--r-xs)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 11.5 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4)', width: 22 }}>{i + 1}</span>
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: f.method === 'GET' ? '#5B9BD5' : '#4CAF7D', width: 44 }}>{f.method}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.url}</span>
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: f.statusCode >= 400 ? 'var(--sev-high)' : 'var(--ink-2)' }}>{f.statusCode}</span>
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{new Date(f.createdAt).toLocaleTimeString('en-GB')}</span>
                  </button>
                ))}
                {flow.length === 0 && <div style={{ fontSize: 11, color: 'var(--ink-3)', padding: 8 }}>No other requests in this session.</div>}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <div style={{ display: 'inline-flex', borderRadius: 4, background: 'var(--bg-2)', padding: 2, marginBottom: 8 }}>
            {(['req', 'res'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 10, padding: '3px 12px', borderRadius: 3, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--paper, white)' : 'transparent',
                color: tab === t ? 'var(--ink-1)' : 'var(--ink-3)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
              }}>
                {t === 'req' ? 'REQUEST' : 'RESPONSE'}
              </button>
            ))}
          </div>
          <pre style={{
            margin: 0, padding: 12, borderRadius: 6, background: '#0F1115', color: '#D7DCE2',
            fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
{`${tab === 'req' ? detail.method : 'HTTP'} ${tab === 'req' ? detail.url : detail.statusCode}${headBlock ? `\n${headBlock}` : ''}${body ? `\n\n${body}` : ''}`}
          </pre>
        </div>
      </div>
    </>
  );
}
