'use client';

/**
 * TrafficMatchPicker — "top matching requests/responses to the AI prompt".
 *
 * Given free text (notes, finding title, chat prompt…), the server finds the
 * most relevant captured endpoints + sample request/response pairs. The user
 * SEES each match (expandable raw request/response) and CHOOSES which ones to
 * attach to the AI prompt. Nothing is added without consent.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { TrafficMatch, TrafficRow } from './types';

type MatchSelection = { match: TrafficMatch; selected: Set<string> };

export function TrafficMatchPicker({
  projectId,
  text,
  title = 'Matching captured traffic',
  contextLabel = 'the AI prompt',
  onClose,
  onConfirm,
}: {
  projectId: string;
  text: string;
  title?: string;
  contextLabel?: string;
  onClose: () => void;
  onConfirm: (samples: TrafficRow[]) => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [matches, setMatches] = useState<TrafficMatch[]>([]);
  const [selections, setSelections] = useState<Map<number, MatchSelection>>(new Map());
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [expandedSample, setExpandedSample] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/burp/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, text: text.slice(0, 20000), limit: 8 }),
        });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || 'Match request failed');
        const list: TrafficMatch[] = Array.isArray(data.matches) ? data.matches : [];
        setMatches(list);
        // Default: select every match's samples (user can untick).
        const sel = new Map<number, MatchSelection>();
        list.forEach((m, i) => sel.set(i, { match: m, selected: new Set(m.samples.map(s => s.id)) }));
        setSelections(sel);
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to find matching traffic');
        setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [projectId, text]);

  const toggleMatch = (i: number, on: boolean) => {
    setSelections(prev => {
      const next = new Map(prev);
      const cur = next.get(i);
      if (!cur) return prev;
      next.set(i, { match: cur.match, selected: on ? new Set(cur.match.samples.map(s => s.id)) : new Set() });
      return next;
    });
  };

  const toggleSample = (i: number, id: string, on: boolean) => {
    setSelections(prev => {
      const next = new Map(prev);
      const cur = next.get(i);
      if (!cur) return prev;
      const set = new Set(cur.selected);
      if (on) set.add(id); else set.delete(id);
      next.set(i, { match: cur.match, selected: set });
      return next;
    });
  };

  const totalSelected = useMemo(() => {
    let n = 0;
    for (const s of selections.values()) n += s.selected.size;
    return n;
  }, [selections]);

  const handleConfirm = () => {
    const picked: TrafficRow[] = [];
    for (const [i, s] of selections.entries()) {
      const match = matches[i];
      if (!match) continue;
      for (const sample of match.samples) {
        if (s.selected.has(sample.id)) picked.push(sample);
      }
    }
    onConfirm(picked);
  };

  const sevColor = (s: number) =>
    s >= 500 ? 'var(--sev-critical)' : s >= 400 ? 'var(--sev-high)' : s >= 300 ? 'var(--sev-medium)' : 'var(--ink-2)';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div style={{
        width: 880, maxWidth: '95vw', height: '85vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ico name="link" size={16} style={{ color: '#5B9BD5' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink-0)' }}>{title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              Top request/response pairs captured by the Burp extension that match your text — tick the ones to add to {contextLabel}.
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}>
            <Ico name="x" size={14} />
          </button>
        </div>

        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {phase === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '50px 0' }}>
              <span style={{ width: 20, height: 20, border: '3px solid var(--line-2)', borderTopColor: '#5B9BD5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Matching captured traffic…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {phase === 'error' && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
              {error}
            </div>
          )}
          {phase === 'ready' && matches.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔭</div>
              No captured traffic matches this text. Ingest traffic from the Burp extension first, then try again.
            </div>
          )}
          {phase === 'ready' && matches.map((m, i) => {
            const sel = selections.get(i);
            const allOn = sel && sel.selected.size === m.samples.length;
            return (
              <div key={m.endpoint.id} style={{ border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', background: 'var(--bg-0)', marginBottom: 10 }}>
                {/* Match header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                  <input
                    type="checkbox"
                    checked={!!allOn}
                    onChange={e => toggleMatch(i, e.target.checked)}
                    style={{ accentColor: '#5B9BD5' }}
                    title="Select all samples for this endpoint"
                  />
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 3,
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)',
                    letterSpacing: '.06em', flexShrink: 0,
                  }}>{m.endpoint.method}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-0)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.endpoint.host}{m.endpoint.path}
                  </span>
                  {m.endpoint.isJsAsset && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#e8b339' }}>JS</span>}
                  {m.endpoint.anomalies.length > 0 && (
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--sev-critical)' }}>⚑ {m.endpoint.anomalies.length}</span>
                  )}
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{Math.round(m.score)}%</span>
                  <button
                    onClick={() => setExpandedMatch(expandedMatch === i ? null : i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', padding: 4 }}
                    title="Expand samples"
                  >
                    <Ico name="chevDown" size={12} style={{ transform: expandedMatch === i ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                  </button>
                </div>

                {/* Samples */}
                {expandedMatch === i && (
                  <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {m.samples.length === 0 && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', padding: '8px 4px' }}>No raw request/response stored for this endpoint.</div>
                    )}
                    {m.samples.map(s => {
                      const on = sel?.selected.has(s.id) ?? false;
                      return (
                        <div key={s.id} style={{ border: '1px solid var(--line-1)', borderRadius: 'var(--r-xs)', background: 'var(--bg-1)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                            <input type="checkbox" checked={on} onChange={e => toggleSample(i, s.id, e.target.checked)} style={{ accentColor: '#5B9BD5' }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{s.tool}</span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</span>
                            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: sevColor(s.statusCode) }}>{s.statusCode}</span>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{Math.round((s.requestBody?.length || 0) / 1024)}KB↑ {Math.round((s.responseBody?.length || 0) / 1024)}KB↓</span>
                            <button
                              onClick={() => setExpandedSample(expandedSample === s.id ? null : s.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', padding: 2 }}
                            >
                              <Ico name={expandedSample === s.id ? 'chevDown' : 'chevRight'} size={11} />
                            </button>
                          </div>
                          {expandedSample === s.id && (
                            <RawTrafficView sample={s} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1 }}>
            {totalSelected > 0
              ? `${totalSelected} request/response pair${totalSelected === 1 ? '' : 's'} selected — they will be fed to ${contextLabel} as factual ground truth.`
              : 'Nothing selected — close to skip traffic context.'}
          </div>
          <button className="btn" onClick={onClose} style={{ fontSize: 12.5 }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={totalSelected === 0} style={{ fontSize: 12.5, gap: 6 }}>
            <Ico name="check" size={13} />
            Add {totalSelected} to {contextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RawTrafficView({ sample }: { sample: TrafficRow }) {
  const [tab, setTab] = useState<'req' | 'res'>('req');
  const reqHeaders = sample.requestHeaders || {};
  const resHeaders = sample.responseHeaders || {};
  const headBlock = tab === 'req'
    ? Object.entries(reqHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
    : Object.entries(resHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
  const body = tab === 'req' ? (sample.requestBody || '') : (sample.responseBody || '');

  return (
    <div style={{ padding: '0 8px 8px' }}>
      <div style={{ display: 'inline-flex', borderRadius: 4, background: 'var(--bg-2)', padding: 2, marginBottom: 6 }}>
        {(['req', 'res'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize: 10, padding: '2px 10px', borderRadius: 3, border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--paper, white)' : 'transparent',
            color: tab === t ? 'var(--ink-1)' : 'var(--ink-3)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
          }}>
            {t === 'req' ? 'REQUEST' : 'RESPONSE'}
          </button>
        ))}
      </div>
      <pre style={{
        margin: 0, padding: 8, borderRadius: 4, background: '#0F1115', color: '#D7DCE2',
        fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.55, maxHeight: 200, overflow: 'auto',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
{headBlock}{body ? `\n\n${body.slice(0, 6000)}${body.length > 6000 ? '\n…[truncated]' : ''}` : ''}
      </pre>
    </div>
  );
}
