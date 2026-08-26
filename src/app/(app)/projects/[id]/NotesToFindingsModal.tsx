'use client';

/**
 * NotesToFindingsModal — "rough notes → multiple findings" in one pass.
 *
 * Uses the engagement's existing Notes tab content (no re-pasting): on open it
 * fetches the current project notes, the AI proposes discrete findings, and
 * you review (tick / edit) then create them all at once.
 */
import React, { useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { TrafficMatchPicker } from '@/components/burp/TrafficMatchPicker';
import type { TrafficRow } from '@/components/burp/types';

type CVSSVec = { AV: string; AC: string; PR: string; UI: string; S: string; C: string; I: string; A: string };

interface Proposal {
  include: boolean;
  title: string;
  severity: string;
  cwe: string;
  owasp: string;
  summary: string;
  description: string;
  reproduction: string;
  impact: string;
  remediation: string;
  references: string;
  assets: string;      // newline separated
  cvss: CVSSVec;
}

const DEFAULT_CVSS: CVSSVec = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'N', I: 'N', A: 'N' };

function calcCVSS(v: CVSSVec): number {
  const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[v.AV as 'N' | 'A' | 'L' | 'P'] ?? 0.85;
  const ac = { L: 0.77, H: 0.44 }[v.AC as 'L' | 'H'] ?? 0.77;
  const pr = (s: string) => {
    if (v.S === 'U') return { N: 0.85, L: 0.62, H: 0.27 }[s as 'N' | 'L' | 'H'] ?? 0.85;
    return { N: 0.85, L: 0.68, H: 0.5 }[s as 'N' | 'L' | 'H'] ?? 0.85;
  };
  const ui = { N: 0.85, R: 0.62 }[v.UI as 'N' | 'R'] ?? 0.85;
  const impact = (c: string, i: string, a: string) => {
    const m = { N: 0, L: 0.22, H: 0.56 }[c as 'N' | 'L' | 'H'] +
             { N: 0, L: 0.22, H: 0.56 }[i as 'N' | 'L' | 'H'] +
             { N: 0, L: 0.22, H: 0.56 }[a as 'N' | 'L' | 'H'];
    if (v.S === 'U') return 6.42 * Math.min(1, (10.41 * (1 - (1 - m / 15) ** 0.5)));
    return 7.52 * (Math.min(1, (10.41 * (1 - (1 - m / 15) ** 0.5))) - 0.029) - 3.25 * ((m / 15) ** 0.9731);
  };
  const isc = impact(v.C, v.I, v.A);
  const esc = v.S === 'U' ? 1.08 * isc : isc;
  const base = Math.min(10, Math.ceil(esc * av * ac * pr(v.PR) * ui * 10) / 10);
  return base < 0 ? 0 : base;
}

function cvssVecToScore(v: CVSSVec): number {
  return Math.round(calcCVSS(v) * 10) / 10;
}
function cvssVecToString(v: CVSSVec): string {
  return `AV:${v.AV}/AC:${v.AC}/PR:${v.PR}/UI:${v.UI}/S:${v.S}/C:${v.C}/I:${v.I}/A:${v.A}`;
}

const SEV_OPTIONS = ['critical', 'high', 'medium', 'low', 'info'];

export function NotesToFindingsModal({ project, existingTitles = [], onClose, onCreated, onGoToNotes }: {
  project: { id: string; name: string; engagement: string; notes?: string; scope?: string; targetCode?: string; engagementYear?: string };
  /** Titles already filed in this engagement — AI avoids re-proposing them. */
  existingTitles?: string[];
  onClose: () => void;
  onCreated: (count: number) => void;
  /** Switch the parent to the Notes tab (when the notes are empty). */
  onGoToNotes?: () => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'empty' | 'review' | 'creating'>('loading');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(0);
  // Burp Bridge: "matching requests" — ask the user which captured traffic to
  // attach to the AI prompt before generating.
  const [matchPhase, setMatchPhase] = useState<'idle' | 'checking' | 'offer' | 'done'>('idle');
  const [hasMatches, setHasMatches] = useState(false);
  const [attached, setAttached] = useState<TrafficRow[]>([]);

  const inScopeAssets = (() => {
    try {
      const p = JSON.parse(project.scope || '[]');
      if (Array.isArray(p)) return p.map((r: { asset?: string } | string) => typeof r === 'string' ? r : (r.asset || '')).filter(Boolean).join('\n');
    } catch { /* ignore */ }
    return '';
  })();

  // On open: pull the CURRENT notes (the Notes tab auto-saves to the server,
  // so the prop may be stale), check for matching Burp traffic, then generate
  // proposals straight away — no re-pasting.
  useEffect(() => {
    let alive = true;
    (async () => {
      let notesText = project.notes || '';
      try {
        const res = await fetch(`/api/projects/${project.id}`);
        if (res.ok) {
          const d = await res.json();
          const n = d.project?.notes ?? d.notes ?? '';
          if (typeof n === 'string') notesText = n;
        }
      } catch { /* fall back to the prop */ }
      if (!alive) return;

      setNotes(notesText || '');
      if (!notesText?.trim()) {
        setPhase('empty');
        return;
      }
      // Check for matching captured traffic — if found, OFFER it to the user
      // before generating (they choose which requests/responses to add).
      setMatchPhase('checking');
      let matches: TrafficRow[] = [];
      try {
        const mres = await fetch('/api/burp/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, text: notesText.slice(0, 20000), limit: 6 }),
        });
        const mdata = await mres.json();
        if (mres.ok && Array.isArray(mdata.matches)) {
          matches = mdata.matches.flatMap((m: { samples?: TrafficRow[] }) => m.samples || []);
        }
      } catch { /* no traffic system — proceed without */ }
      if (!alive) return;

      if (matches.length > 0) {
        setHasMatches(true);
        setMatchPhase('offer'); // show the picker; generation starts on confirm/cancel
      } else {
        setMatchPhase('done');
        await runGenerate(notesText, []);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function runGenerate(notesText: string, trafficRows: TrafficRow[]) {
    setPhase('loading');
    setError('');
    setMatchPhase('done');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'notes-to-findings',
          context: {
            projectId: project.id,
            projectName: project.name,
            engagement: project.engagement,
            notes: notesText,
            assets: inScopeAssets || undefined,
            existingTitles: existingTitles.length > 0 ? existingTitles : undefined,
            trafficIds: trafficRows.map(t => t.id),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI generation failed');

      const list: Array<{
        title?: string; severity?: string; cwe?: string; owasp?: string; summary?: string;
        description?: string; reproduction?: string; impact?: string; remediation?: string;
        references?: string; assets?: string[]; cvss?: Partial<CVSSVec>;
      }> = Array.isArray(data.findings) ? data.findings : [];

      if (list.length === 0) {
        setError('The AI didn\'t find any clear findings in your notes. Add more detail (endpoints, observed behaviour) in the Notes tab and try again.');
        setPhase('empty');
        return;
      }
      setProposals(list.map(f => ({
        include: true,
        title: f.title || 'Security finding',
        severity: f.severity || 'medium',
        cwe: f.cwe || '',
        owasp: f.owasp || '',
        summary: f.summary || '',
        description: f.description || '',
        reproduction: f.reproduction || '',
        impact: f.impact || '',
        remediation: f.remediation || '',
        references: f.references || '',
        assets: Array.isArray(f.assets) ? f.assets.join('\n') : '',
        cvss: { ...DEFAULT_CVSS, ...(f.cvss || {}) } as CVSSVec,
      })));
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setPhase('empty');
    }
  }

  function update(i: number, patch: Partial<Proposal>) {
    setProposals(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  }

  async function createAll() {
    const selected = proposals.filter(p => p.include);
    if (selected.length === 0) return;
    setPhase('creating');
    let ok = 0;
    const failures: string[] = [];
    for (let i = 0; i < selected.length; i++) {
      const f = selected[i];
      setCreating(i + 1);
      try {
        const res = await fetch(`/api/projects/${project.id}/findings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: f.title.trim(),
            severity: f.severity,
            summary: f.summary,
            description: f.description,
            reproduction: f.reproduction,
            impact: f.impact,
            remediation: f.remediation,
            references: f.references,
            cwe: f.cwe.trim(),
            owasp: f.owasp.trim(),
            assets: f.assets.split('\n').map(a => a.trim()).filter(Boolean),
            cvss: cvssVecToScore(f.cvss),
            cvssVector: cvssVecToString(f.cvss),
            cvssLocked: false,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          failures.push(`${f.title}: ${d.error || `HTTP ${res.status}`}`);
        } else {
          ok++;
        }
      } catch {
        failures.push(`${f.title}: network error`);
      }
    }
    if (ok > 0) {
      toast.success(`${ok} finding${ok === 1 ? '' : 's'} created`, { description: project.name });
      onCreated(ok);
    }
    if (failures.length > 0) {
      toast.error(`${failures.length} finding${failures.length === 1 ? '' : 's'} failed`, { description: failures[0].slice(0, 120) });
    }
    onClose();
  }

  const label = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div style={{
        width: 860, maxWidth: '94vw', height: '88vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ico name="sparkles" size={16} style={{ color: '#9b7fd4' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)' }}>Rough notes → findings</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              {project.name}{project.engagement ? ` · ${project.engagement}` : ''} — generated from your Notes tab
            </div>
          </div>
          <button onClick={onClose} disabled={phase === 'creating'} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}>
            <Ico name="x" size={14} />
          </button>
        </div>

        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {phase === 'loading' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '60px 0' }}>
              <span style={{ width: 22, height: 22, border: '3px solid var(--line-2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Reading your notes & generating findings…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : phase === 'empty' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 0', textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
              <span style={{ fontSize: 30 }}>📝</span>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)' }}>
                {notes.trim() ? 'No clear findings in your notes' : 'Your Notes tab is empty'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                {notes.trim()
                  ? 'The AI couldn\'t identify any clear findings from the notes. Add more detail (endpoints, observed behaviour, impact) and try again.'
                  : 'Add your rough engagement notes in the Notes tab first — the AI turns them into findings from there.'}
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--sev-critical)', background: 'rgba(255,92,58,.08)', border: '1px solid rgba(255,92,58,.2)', borderRadius: 'var(--r-sm)', padding: '8px 12px', maxWidth: 420 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={onClose} style={{ fontSize: 12.5 }}>Close</button>
                {onGoToNotes && (
                  <button className="btn btn-primary" onClick={() => { onClose(); onGoToNotes(); }} style={{ fontSize: 12.5, gap: 6 }}>
                    <Ico name="pen" size={12} />
                    Go to Notes tab
                  </button>
                )}
              </div>
            </div>
          ) : phase === 'review' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1 }}>
                  {proposals.length} finding{proposals.length === 1 ? '' : 's'} proposed from your notes — tick the ones to keep, edit anything, then create.
                  {attached.length > 0 && (
                    <span style={{ color: '#5B9BD5' }}> · <strong>{attached.length}</strong> captured request/response pair{attached.length === 1 ? '' : 's'} attached to the AI</span>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => runGenerate(notes, attached)} style={{ fontSize: 11, gap: 4 }}>
                  <Ico name="sparkles" size={11} style={{ color: '#9b7fd4' }} /> Regenerate
                </button>
                {hasMatches && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setMatchPhase('offer')}
                    style={{ fontSize: 11, gap: 4 }}
                    title="Re-open the matching traffic picker"
                  >
                    <Ico name="link" size={11} style={{ color: '#5B9BD5' }} />
                    {attached.length > 0 ? `${attached.length} traffic pair${attached.length === 1 ? '' : 's'} attached` : 'Attach traffic'}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setNotesOpen(v => !v)} style={{ fontSize: 11, gap: 4 }}>
                  <Ico name={notesOpen ? 'chevDown' : 'chevRight'} size={11} />
                  {notesOpen ? 'Hide notes' : 'View notes'}
                </button>
              </div>
              {notesOpen && (
                <div style={{
                  border: '1px dashed var(--line-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px',
                  fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)',
                  whiteSpace: 'pre-wrap', maxHeight: 140, overflowY: 'auto', background: 'var(--bg-0)',
                }}>
                  {notes}
                </div>
              )}
              {proposals.map((p, i) => (
                <div key={i} style={{ border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', background: 'var(--bg-0)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                    <input type="checkbox" checked={p.include} onChange={e => update(i, { include: e.target.checked })} />
                    <button onClick={() => setExpanded(expanded === i ? null : i)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, minWidth: 0 }}>
                      <span style={{
                        fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em',
                        padding: '1px 6px', borderRadius: 3, color: '#fff', flexShrink: 0,
                        background: p.severity === 'critical' ? 'var(--sev-critical)' : p.severity === 'high' ? 'var(--sev-high)' : p.severity === 'medium' ? 'var(--sev-medium)' : p.severity === 'low' ? 'var(--sev-low)' : 'var(--sev-info, #3A6EA5)',
                      }}>{p.severity}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--ink-0)' }}>{p.title}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', flexShrink: 0 }}>CVSS {cvssVecToScore(p.cvss).toFixed(1)}</span>
                      <Ico name="chevDown" size={12} style={{ color: 'var(--ink-3)', transform: expanded === i ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                    </button>
                  </div>
                  {expanded === i && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 110px 1fr', gap: 6 }}>
                        <input className="input" value={p.title} onChange={e => update(i, { title: e.target.value })} placeholder="Title" style={{ gridColumn: '1 / 3' }} />
                        <select className="input" value={p.severity} onChange={e => update(i, { severity: e.target.value })}>
                          {SEV_OPTIONS.map(s => <option key={s} value={s}>{label(s)}</option>)}
                        </select>
                        <input className="input" value={p.cwe} onChange={e => update(i, { cwe: e.target.value })} placeholder="CWE-79" />
                        <input className="input" value={p.owasp} onChange={e => update(i, { owasp: e.target.value })} placeholder="A03:2021" />
                        <input className="input" value={p.assets} onChange={e => update(i, { assets: e.target.value })} placeholder="Assets (one per line)" style={{ gridColumn: '1 / 6', fontFamily: 'var(--font-mono)', fontSize: 11.5 }} />
                      </div>
                      {([['summary', 'Summary', 2], ['description', 'Description', 4], ['reproduction', 'Reproduction', 4], ['impact', 'Impact', 3], ['remediation', 'Remediation', 3], ['references', 'References', 2]] as const).map(([key, lbl, rows]) => (
                        <div key={key}>
                          <div className="eyebrow" style={{ fontSize: 8.5, marginBottom: 3 }}>{lbl}</div>
                          <textarea
                            className="input"
                            value={p[key]}
                            onChange={e => update(i, { [key]: e.target.value } as Partial<Proposal>)}
                            rows={rows}
                            style={{ width: '100%', fontSize: 12, lineHeight: 1.6, resize: 'vertical' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '60px 0' }}>
              <span style={{ width: 22, height: 22, border: '3px solid var(--line-2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                Creating findings… {creating}/{proposals.filter(p => p.include).length}
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {phase === 'review' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1 }}>
                {proposals.filter(p => p.include).length} selected
              </div>
              <button className="btn btn-primary" onClick={createAll} disabled={proposals.filter(p => p.include).length === 0} style={{ gap: 6 }}>
                <Ico name="check" size={13} />
                Create {proposals.filter(p => p.include).length} finding{proposals.filter(p => p.include).length === 1 ? '' : 's'}
              </button>
            </>
          )}
          {phase === 'empty' && (
            <button className="btn" onClick={onClose} style={{ marginLeft: 'auto', fontSize: 12.5 }}>Close</button>
          )}
        </div>
      </div>

      {/* Matching-traffic offer — user chooses which captured requests/responses
          to attach to the AI prompt before generation starts. */}
      {matchPhase === 'offer' && (
        <TrafficMatchPicker
          projectId={project.id}
          text={notes}
          title="Matching captured traffic"
          contextLabel="the finding-generation prompt"
          onClose={() => {
            setMatchPhase('done');
            if (phase === 'loading' && proposals.length === 0) runGenerate(notes, []);
          }}
          onConfirm={(samples) => {
            setAttached(samples);
            setMatchPhase('done');
            if (phase === 'loading') runGenerate(notes, samples);
          }}
        />
      )}
    </div>
  );
}
