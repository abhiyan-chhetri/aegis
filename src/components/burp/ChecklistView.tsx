'use client';

/**
 * ChecklistView — the AI attack checklist: items from the curated cheatsheet
 * + per-endpoint AI proposals. Track tested/succeeded/failed; when a technique
 * FAILS, ask the AI for bypasses grounded in the captured traffic — then add
 * the bypass attempts straight back into the checklist.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { ChecklistItem } from './types';

const STATUSES = ['untested', 'tested', 'succeeded', 'failed', 'blocked'] as const;
const STATUS_COLORS: Record<string, string> = {
  untested: 'var(--ink-3)',
  tested: '#5B9BD5',
  succeeded: 'var(--status-resolved)',
  failed: 'var(--sev-critical)',
  blocked: 'var(--sev-medium)',
};

const CATEGORY_ICONS: Record<string, string> = {
  xss: '🧨', sqli: '💉', ssti: '🪄', xxe: '📄', ssrf: '🌐', idor: '🔑', auth: '🛂',
  jwt: '🎫', 'file-upload': '📤', 'command-injection': '⌨️', 'path-traversal': '🗂️',
  deserialization: '🧊', api: '🔌', graphql: '🕸️', 'cors-csrf': '🛡️',
  'open-redirect': '↩️', 'info-disclosure': '🔍', headers: '🪪', 'rate-limit': '⏱️', recon: '🧭',
};

export function ChecklistView({ projectId, projectName, onStatsChange }: {
  projectId: string;
  projectName: string;
  onStatsChange: () => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [bypassFor, setBypassFor] = useState<ChecklistItem | null>(null);
  // Chunked rendering — a big capture can produce thousands of checklist
  // items; never mount them all at once.
  const [visibleCount, setVisibleCount] = useState(50);
  const [showAll, setShowAll] = useState(false);
  // Aegis payload runner (mini-Intruder)
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, { reflected: boolean; error: boolean; statusCode: number; durationMs: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter) sp.set('status', statusFilter);
      if (catFilter) sp.set('category', catFilter);
      const res = await fetch(`/api/projects/${projectId}/burp/checklist?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load checklist');
      setItems(data.items || []);
      setVisibleCount(50);
      setShowAll(false);
    } catch (e) {
      toast.error('Couldn\'t load checklist', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, catFilter]);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => [...new Set(items.map(i => i.category))].sort(), [items]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { untested: 0, tested: 0, succeeded: 0, failed: 0, blocked: 0 };
    for (const i of items) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [items]);

  const shownItems = showAll ? items : items.slice(0, visibleCount);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/checklist/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'both' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      toast.success(`${data.created} checklist items added`, {
        description: `AI: ${data.sources?.ai ?? 0} · cheatsheet: ${data.sources?.cheatsheet ?? 0}${data.sources?.playbook ? ` · playbook: ${data.sources.playbook}` : ''}`,
      });
      load();
      onStatsChange();
    } catch (e) {
      toast.error('Checklist generation failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setGenerating(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Aegis payload runner ───────────────────────────────────────────────────
  const runItems = async (items: Array<{ id: string; payload: string }>, label: string) => {
    if (items.length === 0) return;
    setRunningId(label);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ itemId: i.id, payload: i.payload })), useSession: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Run failed');
      const results = (d.results || []) as Array<{ itemId?: string; reflected: boolean; error: boolean; timing: boolean; statusCode: number; durationMs: number; errorMsg?: string }>;
      const next: Record<string, { reflected: boolean; error: boolean; statusCode: number; durationMs: number }> = {};
      let confirmed = 0;
      for (const r of results) {
        if (!r.itemId) continue;
        next[r.itemId] = { reflected: r.reflected, error: r.error, statusCode: r.statusCode, durationMs: r.durationMs };
        if (r.reflected || r.error || r.timing) confirmed++;
      }
      setRunResults(prev => ({ ...prev, ...next }));
      toast.success(`Ran ${results.length} payload${results.length === 1 ? '' : 's'} — ${confirmed} confirmed`, { description: 'Items updated (succeeded/tested) with evidence.' });
      load();
      onStatsChange();
    } catch (e) {
      toast.error('Runner failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setRunningId(null);
    }
  };

  const exportChecklist = async (format: 'markdown' | 'pdf') => {
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/checklist/export?format=${format}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      downloadBlob(blob, `aegis-checklist-${projectName.replace(/\s+/g, '-').toLowerCase()}.${format === 'pdf' ? 'pdf' : 'md'}`);
      toast.success(`Checklist exported (${format})`);
    } catch (e) {
      toast.error('Export failed', { description: e instanceof Error ? e.message : 'network error' });
    }
  };

  const setStatus = async (item: ChecklistItem, status: string, note?: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(note !== undefined ? { resultNote: note } : {}) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Update failed');
      }
      load();
      onStatsChange();
      if (status === 'failed' && !noteFor) setBypassFor({ ...item, status: 'failed' as any, resultNote: note || item.resultNote || '' });
      setNoteFor(null);
    } catch (e) {
      toast.error('Update failed', { description: e instanceof Error ? e.message : 'network error' });
    }
  };

  const saveNote = async (item: ChecklistItem) => {
    await setStatus(item, item.status, noteText);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 100,
              border: '1px solid', fontSize: 10.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              letterSpacing: '.05em', cursor: 'pointer',
              borderColor: statusFilter === s ? STATUS_COLORS[s] : 'var(--line-1)',
              background: statusFilter === s ? `color-mix(in srgb, ${STATUS_COLORS[s]} 12%, transparent)` : 'transparent',
              color: statusFilter === s ? STATUS_COLORS[s] : 'var(--ink-2)',
            }}
          >
            {s} {counts[s] || 0}
          </button>
        ))}
        {categories.length > 0 && (
          <select className="input" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 170, fontSize: 11.5, marginLeft: 4 }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c] || '•'} {c}</option>)}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {items.length} item{items.length === 1 ? '' : 's'} · {projectName}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }} title="Drag any item onto the Interesting rail to promote it to a finding">
          drag → rail → finding
        </span>
        {counts.untested > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => runItems(items.filter(i => i.status === 'untested').slice(0, 15).map(i => ({ id: i.id, payload: i.payload })), 'bulk')}
            disabled={runningId !== null}
            style={{ gap: 4, fontSize: 11 }}
            title="Replay the untested payloads against their endpoints (max 15) — auto-detects reflection/errors"
          >
            <Ico name="zap" size={12} style={{ color: runningId !== null ? 'var(--ink-3)' : '#e8b339' }} />
            {runningId === 'bulk' ? 'Running…' : `Run ${Math.min(counts.untested, 15)} untested`}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => exportChecklist('markdown')}
          style={{ gap: 4, fontSize: 11 }}
          title="Export the checklist as markdown (test-plan approval)"
        >
          <Ico name="download" size={12} />
          MD
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => exportChecklist('pdf')}
          style={{ gap: 4, fontSize: 11 }}
          title="Export the checklist as a PDF (client test-plan approval)"
        >
          <Ico name="paper" size={12} />
          PDF
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={generate}
          disabled={generating}
          style={{ gap: 4, fontSize: 11 }}
          title="Merge the curated god-level cheatsheet with AI-proposed endpoint techniques + proven bypasses from previous engagements"
        >
          <Ico name="sparkles" size={12} style={{ color: '#9b7fd4' }} />
          {generating ? 'Generating…' : 'Generate checklist (AI + cheatsheet + playbook)'}
        </button>
      </div>

      {!loading && items.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🗒️</div>
          No checklist items yet. Capture some traffic, then <strong>Generate checklist</strong> — the AI + curated cheatsheet will build your attack plan per endpoint.
        </div>
      )}

      {shownItems.map(item => (
        <div
          key={item.id}
          className="card"
          draggable
          onDragStart={e => {
            e.dataTransfer.setData('text/aegis-checklist', item.id);
            e.dataTransfer.setData('text/plain', item.id);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          title="Drag to the Interesting rail to promote this to a finding"
          style={{ padding: 0, overflow: 'hidden', cursor: 'grab' }}
        >
          {/* Item header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
            <span style={{ fontSize: 15 }}>{CATEGORY_ICONS[item.category] || '•'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{item.technique}</span>
                {item.source === 'cheatsheet' && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#a78bfa', background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.25)', padding: '0 5px', borderRadius: 3 }}>CHEATSHEET</span>
                )}
                {item.source === 'ai' && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#9b7fd4', background: 'rgba(155,127,212,.1)', border: '1px solid rgba(155,127,212,.25)', padding: '0 5px', borderRadius: 3 }}>AI</span>
                )}
                {item.source === 'playbook' && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#4CAF7D', background: 'rgba(76,175,125,.1)', border: '1px solid rgba(76,175,125,.3)', padding: '0 5px', borderRadius: 3 }}>⚑ PLAYBOOK</span>
                )}
                {item.source === 'auto' && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--status-resolved)', background: 'rgba(143,201,122,.1)', border: '1px solid rgba(143,201,122,.3)', padding: '0 5px', borderRadius: 3 }}>✓ AUTO-CONFIRMED</span>
                )}
                {item.autoMarkedBy && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#5B9BD5', background: 'rgba(91,155,213,.1)', border: '1px solid rgba(91,155,213,.25)', padding: '0 5px', borderRadius: 3 }}>
                    AUTO-TESTED via {item.autoMarkedBy}
                  </span>
                )}
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{item.category}</span>
                {item.epHost && item.epPath && (
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                    {item.epMethod} {item.epHost}{item.epPath}
                  </span>
                )}
              </div>
              {item.description && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{item.description}</div>}
            </div>

            {/* Status actions */}
            <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
              <span style={{
                padding: '2px 9px', borderRadius: 100, fontSize: 9.5, fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700,
                background: `color-mix(in srgb, ${STATUS_COLORS[item.status]} 12%, transparent)`,
                color: STATUS_COLORS[item.status],
                border: `1px solid color-mix(in srgb, ${STATUS_COLORS[item.status]} 30%, transparent)`,
              }}>{item.status}</span>
              <select
                value=""
                onChange={e => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === 'failed') {
                    // Persist the failure, then offer AI bypasses grounded in
                    // the actual captured traffic for this endpoint.
                    setStatus(item, 'failed');
                    setBypassFor({ ...item, status: 'failed' });
                  } else {
                    setStatus(item, v);
                  }
                }}
                style={{ fontSize: 10.5, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--line-2)', background: 'var(--bg-1)', color: 'var(--ink-1)', cursor: 'pointer' }}
                title="Set status"
              >
                <option value="">Set…</option>
                <option value="tested">✓ tested</option>
                <option value="succeeded">✓✓ succeeded</option>
                <option value="failed">✗ failed → AI bypass</option>
                <option value="blocked">⊘ blocked</option>
                <option value="untested">reset</option>
              </select>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                title="Show payload / notes"
                style={{ width: 26, padding: 0 }}
              >
                <Ico name={expanded === item.id ? 'chevDown' : 'chevRight'} size={12} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => runItems([{ id: item.id, payload: item.payload }], item.id)}
                disabled={runningId !== null || item.status === 'succeeded'}
                title="Replay this payload against the endpoint via the Aegis runner (auto-detects reflection/errors)"
                style={{ width: 26, padding: 0, color: runningId === item.id ? '#e8b339' : 'var(--ink-2)' }}
              >
                <Ico name="zap" size={12} />
              </button>
            </div>
          </div>

          {/* Runner result inline */}
          {runResults[item.id] && (
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '6px 14px', fontSize: 11, background: 'var(--bg-2)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="mono" style={{ fontWeight: 700, color: runResults[item.id].statusCode >= 400 ? 'var(--sev-high)' : 'var(--ink-1)' }}>
                HTTP {runResults[item.id].statusCode || '—'}
              </span>
              <span style={{ color: 'var(--ink-3)' }}>{runResults[item.id].durationMs}ms</span>
              {runResults[item.id].reflected && <span style={{ color: 'var(--sev-critical)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>⛭ REFLECTED</span>}
              {runResults[item.id].error && <span style={{ color: 'var(--sev-critical)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>⚠ ERROR PATTERN</span>}
              {!runResults[item.id].reflected && !runResults[item.id].error && <span style={{ color: 'var(--ink-4)' }}>no reflection/error</span>}
            </div>
          )}

          {/* Expanded: payload + note + result note */}
          {expanded === item.id && (
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {item.payload && (
                <div>
                  <div className="eyebrow" style={{ fontSize: 8.5, marginBottom: 3 }}>Starting payload</div>
                  <pre style={{ margin: 0, padding: 8, borderRadius: 4, background: '#0F1115', color: '#D7DCE2', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.payload}</pre>
                </div>
              )}
              {item.resultNote && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-xs)', padding: '6px 10px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Result note · </span>
                  {item.resultNote}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {noteFor === item.id ? (
                  <>
                    <input className="input" value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Note what you tried / observed…" style={{ flex: 1, fontSize: 12 }} autoFocus />
                    <button className="btn btn-sm" onClick={() => saveNote(item)} style={{ fontSize: 11 }}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setNoteFor(null)} style={{ fontSize: 11 }}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setNoteFor(item.id); setNoteText(item.resultNote || ''); }} style={{ fontSize: 10.5, gap: 4 }}>
                    <Ico name="pen" size={11} />
                    {item.resultNote ? 'Edit note' : 'Add note'}
                  </button>
                )}
                {item.status === 'failed' && (
                  <button className="btn btn-sm" onClick={() => setBypassFor(item)} style={{ fontSize: 10.5, gap: 4, marginLeft: 'auto' }}>
                    <Ico name="sparkles" size={11} style={{ color: '#9b7fd4' }} />
                    Ask AI for bypasses
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {!showAll && items.length > visibleCount && (
        <div style={{ padding: '8px 16px', textAlign: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setVisibleCount(c => c + 100)} style={{ fontSize: 11, gap: 4 }}>
            Show {Math.min(100, items.length - visibleCount)} more ({items.length - visibleCount} remaining)
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)} style={{ fontSize: 11, marginLeft: 8 }}>
            Show all {items.length}
          </button>
        </div>
      )}

      {bypassFor && (
        <BypassModal
          projectId={projectId}
          item={bypassFor}
          onClose={() => setBypassFor(null)}
          onAdded={(n) => { toast.success(`${n} bypass item${n === 1 ? '' : 's'} added to checklist`); load(); onStatsChange(); }}
        />
      )}
    </div>
  );
}

// ── Bypass modal ──────────────────────────────────────────────────────────────

function BypassModal({ projectId, item, onClose, onAdded }: {
  projectId: string;
  item: ChecklistItem;
  onClose: () => void;
  onAdded: (n: number) => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [markdown, setMarkdown] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ category: string; technique: string; description: string; payload: string }>>([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ payload: string; reflected: boolean; error: boolean; statusCode: number; durationMs: number }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/burp/checklist/${item.id}/bypass`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || 'Bypass generation failed');
        setMarkdown(data.markdown || '');
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Bypass generation failed');
        setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [projectId, item.id]);

  const addSuggestions = async (confirmOnly?: boolean) => {
    setAdding(true);
    try {
      const filtered = confirmOnly
        ? suggestions.slice(0, 8).filter((_, i) => testResults[i]?.reflected || testResults[i]?.error)
        : suggestions;
      if (filtered.length === 0) { onClose(); return; }
      const res = await fetch(`/api/projects/${projectId}/burp/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: filtered.map(s => ({
            category: s.category,
            technique: s.technique,
            description: s.description,
            payload: s.payload,
            endpointId: item.endpointId,
            parentId: item.id,
            source: 'bypass',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Add failed');
      if (confirmOnly && Array.isArray(data.ids)) {
        // Confirmed by the runner → add as SUCCEEDED (living playbook seeds).
        for (const id of data.ids as string[]) {
          await fetch(`/api/projects/${projectId}/burp/checklist/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'succeeded', resultNote: 'Confirmed by Aegis payload runner' }),
          });
        }
      }
      onAdded(data.created || 0);
      onClose();
    } catch (e) {
      toast.error('Couldn\'t add bypass items', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setAdding(false);
    }
  };

  // Run the suggested bypass payloads through the Aegis runner now.
  const testInAegis = async () => {
    setTesting(true);
    setTestResults([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: suggestions.slice(0, 8).map(s => ({ payload: s.payload, endpointId: item.endpointId })),
          useSession: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Run failed');
      const results = (d.results || []) as Array<{ payload?: string; reflected: boolean; error: boolean; timing: boolean; statusCode: number; durationMs: number }>;
      const mapped = results.map(r => ({
        payload: r.payload || '',
        reflected: r.reflected,
        error: r.error || r.timing,
        statusCode: r.statusCode,
        durationMs: r.durationMs,
      }));
      setTestResults(mapped);
      const confirmed = mapped.filter(r => r.reflected || r.error).length;
      if (confirmed > 0) {
        toast.success(`${confirmed} bypass${confirmed === 1 ? '' : 'es'} CONFIRMED by the runner`, { description: 'Add them as succeeded, or review first.' });
      } else {
        toast.info('No bypass confirmed', { description: 'None reflected or errored — review the responses before trusting them.' });
      }
    } catch (e) {
      toast.error('Runner failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div style={{
        width: 760, maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ico name="sparkles" size={16} style={{ color: '#9b7fd4' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink-0)' }}>AI bypass — {item.technique}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              The attempt failed — the AI read the actual captured request/response for this endpoint and suggests what to try next.
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}><Ico name="x" size={14} /></button>
        </div>

        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {phase === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '50px 0' }}>
              <span style={{ width: 20, height: 20, border: '3px solid var(--line-2)', borderTopColor: '#9b7fd4', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Reading captured traffic & proposing bypasses…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {phase === 'error' && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--sev-critical)', fontSize: 12.5 }}>{error}</div>
          )}
          {phase === 'ready' && (
            <div className="md-preview" style={{ fontSize: 13, lineHeight: 1.65 }}>
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Runner results */}
        {testResults.length > 0 && (
          <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, maxHeight: 160, overflowY: 'auto' }}>
            {testResults.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 8px', background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-xs)' }}>
                <span className="mono" style={{ color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{r.payload}</span>
                <span className="mono" style={{ fontWeight: 700, color: r.statusCode >= 400 ? 'var(--sev-high)' : 'var(--ink-1)' }}>{r.statusCode || '—'}</span>
                <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>{r.durationMs}ms</span>
                {r.reflected && <span style={{ color: 'var(--sev-critical)', fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>⛭ REFLECTED</span>}
                {r.error && <span style={{ color: 'var(--sev-critical)', fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>⚠ ERROR</span>}
                {!r.reflected && !r.error && <span style={{ color: 'var(--ink-4)' }}>clean</span>}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1 }}>
            {suggestions.length > 0
              ? `${suggestions.length} concrete bypass attempt${suggestions.length === 1 ? '' : 's'} ready to add as checklist items (child of "${item.technique}").`
              : 'No structured suggestions parsed — copy what you need from the analysis.'}
          </div>
          <button className="btn" onClick={onClose} style={{ fontSize: 12.5 }}>Close</button>
          {suggestions.length > 0 && (
            <>
              <button
                className="btn btn-ghost"
                onClick={testInAegis}
                disabled={testing || adding}
                style={{ fontSize: 12, gap: 5 }}
                title="Replay each bypass payload against the endpoint now — auto-detects reflection/errors"
              >
                <Ico name="zap" size={13} style={{ color: testing ? 'var(--ink-3)' : '#e8b339' }} />
                {testing ? 'Running…' : 'Test in Aegis'}
              </button>
              {testResults.some(r => r.reflected || r.error) && (
                <button className="btn btn-primary" onClick={() => addSuggestions(true)} disabled={adding} style={{ fontSize: 12, gap: 5 }}>
                  <Ico name="check" size={13} />
                  Add confirmed ({testResults.filter(r => r.reflected || r.error).length}) as succeeded
                </button>
              )}
              <button className="btn" onClick={() => addSuggestions()} disabled={adding} style={{ fontSize: 12, gap: 5 }}>
                <Ico name="plus" size={13} />
                {adding ? 'Adding…' : `Add ${suggestions.length}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
