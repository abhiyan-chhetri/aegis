'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ico } from '@/components/chrome/icons';
import { Avatar } from '@/components/chrome/icons';
import { Sev, StatusPill, SevCounts } from '@/components/ui/SevBadge';
import { ReportVersionHistory } from '@/components/reports/ReportVersionHistory';

type ScopeRow = { asset: string; type: string; notes: string };

type Finding = {
  id: string;
  code: string;
  title: string;
  severity: string;
  status: string;
  cvss: number;
  assignee: { name: string; initials: string } | null;
  discovered: string;
};

type Report = {
  id: string;
  code: string;
  templateName: string;
  status: string;
  version: string;
  author: { name: string; initials: string };
  createdAt: string;
  reviewComment?: string;
  reviewedAt?: string | null;
  reviewerId?: string | null;
};

type Member = { id: string; name: string; initials: string; role: string; email: string };

type Project = {
  id: string;
  name: string;
  engagement: string;
  code: string;
  status: string;
  progress: number;
  startDate: string;
  endDate: string;
  executiveSummary: string;
  methodology: string;
  attackNarrative: string;
  members: string;
  lead: { id: string; name: string; initials: string; role: string };
};

type Counts = Record<string, number>;

type Props = {
  project: Project;
  findings: Finding[];
  reports: Report[];
  counts: Counts;
  scopeRows: ScopeRow[];
  allUsers: Member[];
};

const TABS = ['Overview', 'Findings', 'Reports', 'Scope', 'Report Content'] as const;
type Tab = typeof TABS[number];

const SEV_ORDER = ['all', 'critical', 'high', 'medium', 'low', 'info'];

// ── Inline-save text area ─────────────────────────────────────────────────────
function AutoSaveField({
  label, hint, value: initial, field, projectId, rows = 6, placeholder,
}: {
  label: string; hint?: string; value: string; field: string;
  projectId: string; rows?: number; placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (v: string) => {
    setStatus('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: v }),
      });
      setStatus(res.ok ? 'saved' : 'error');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  }, [field, projectId]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setStatus('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(e.target.value), 900);
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
          color: status === 'saved' ? 'var(--status-resolved)' : status === 'error' ? 'var(--sev-critical)' : status === 'saving' ? 'var(--ink-3)' : 'transparent',
          transition: 'color 0.2s',
        }}>
          {status === 'saving' ? 'saving…' : status === 'saved' ? '✓ saved' : status === 'error' ? 'error' : '·'}
        </span>
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>{hint}</div>}
      <textarea
        className="input"
        value={value}
        onChange={handleChange}
        rows={rows}
        placeholder={placeholder}
        style={{ width: '100%', lineHeight: 1.65, resize: 'vertical', fontFamily: value.includes('```') ? 'var(--font-mono)' : undefined, fontSize: 13 }}
      />
    </div>
  );
}

// ── Scope manager (inline edit) ───────────────────────────────────────────────
function ScopeManager({ initial, projectId }: { initial: ScopeRow[]; projectId: string }) {
  const [rows, setRows] = useState<ScopeRow[]>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(next: ScopeRow[]) {
    setStatus('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: JSON.stringify(next.filter(r => r.asset.trim())) }),
      });
      setStatus(res.ok ? 'saved' : 'error');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus('idle'), 2000);
    } catch { setStatus('error'); }
  }

  function update(i: number, field: keyof ScopeRow, val: string) {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
    setRows(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 800);
  }

  function add() {
    const next = [...rows, { asset: '', type: '', notes: '' }];
    setRows(next);
  }

  function remove(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next);
    persist(next);
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
        <div>
          <div className="eyebrow">In-scope assets</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Listed in the Scope &amp; Methodology section of the report</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: status === 'saved' ? 'var(--status-resolved)' : status === 'saving' ? 'var(--ink-3)' : 'transparent' }}>
            {status === 'saving' ? 'saving…' : status === 'saved' ? '✓ saved' : '·'}
          </span>
          <button type="button" className="btn btn-sm" onClick={add}>
            <Ico name="plus" size={12} /> Add Asset
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
          No assets yet. Click &ldquo;Add Asset&rdquo; to define scope.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 2fr auto', background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)', padding: '6px 14px' }}>
            {['Asset / URL', 'Type', 'Notes', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>{h}</div>
            ))}
          </div>
          {rows.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 2fr auto', borderBottom: i < rows.length - 1 ? '1px solid var(--line-1)' : 'none', alignItems: 'center' }}>
              <input className="input" value={row.asset} onChange={e => update(i, 'asset', e.target.value)}
                placeholder="api.example.com" style={{ border: 'none', borderRadius: 0, borderRight: '1px solid var(--line-1)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
              <input className="input" value={row.type} onChange={e => update(i, 'type', e.target.value)}
                placeholder="REST API" style={{ border: 'none', borderRadius: 0, borderRight: '1px solid var(--line-1)', fontSize: 12 }} />
              <input className="input" value={row.notes} onChange={e => update(i, 'notes', e.target.value)}
                placeholder="Notes…" style={{ border: 'none', borderRadius: 0, borderRight: '1px solid var(--line-1)', fontSize: 12 }} />
              <button type="button" onClick={() => remove(i)}
                style={{ width: 36, height: '100%', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ico name="x" size={11} />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Members manager (inline) ──────────────────────────────────────────────────
function MembersManager({ initial, allUsers, projectId }: { initial: string[]; allUsers: Member[]; projectId: string }) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(ids: string[]) {
    setStatus('saving');
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: ids }),
    });
    setStatus('saved');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2000);
  }

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    setSelected(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 500);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>Team Members</label>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: status === 'saved' ? 'var(--status-resolved)' : status === 'saving' ? 'var(--ink-3)' : 'transparent' }}>
          {status === 'saving' ? 'saving…' : status === 'saved' ? '✓ saved' : '·'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allUsers.map(u => (
          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--r-sm)', background: selected.includes(u.id) ? 'var(--bg-2)' : 'transparent', border: `1px solid ${selected.includes(u.id) ? 'var(--line-2)' : 'var(--line-1)'}`, transition: 'all 0.12s' }}>
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} style={{ accentColor: 'var(--accent)' }} />
            <Avatar name={u.name} size={26} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{u.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{u.role} · {u.email}</div>
            </div>
            {selected.includes(u.id) && <Ico name="check" size={13} style={{ color: 'var(--status-resolved)' }} />}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── AI Types & Overlay ────────────────────────────────────────────────────────
type AIPhase = 'idle' | 'thinking' | 'writing' | 'done';

const AI_PHASE_LABELS: Record<AIPhase, string> = {
  idle: '',
  thinking: 'Analysing findings and risk posture…',
  writing: 'Writing executive summary and attack narrative…',
  done: 'Content generated — saving…',
};

function SummaryAIOverlay({ phase, findingCount }: { phase: AIPhase; findingCount: number }) {
  if (phase === 'idle') return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,8,20,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(6px)',
    }}>
      <style>{`
        @keyframes aiSummaryRing { 0%,100%{transform:scale(1);opacity:0.4} 50%{transform:scale(1.18);opacity:0.15} }
        @keyframes aiSummaryCore { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes aiSummaryPulse { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }
        @keyframes aiSummarySlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Orb */}
      <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 32 }}>
        {[1.6, 1.35, 1.12].map((scale, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(168,85,247,${0.06 - i * 0.015}) 0%, transparent 70%)`,
            transform: `scale(${scale})`,
            animation: `aiSummaryRing ${1.8 + i * 0.4}s ease-in-out infinite ${i * 0.3}s`,
          }} />
        ))}
        <div style={{
          position: 'absolute', inset: '20%',
          borderRadius: '50%',
          background: 'radial-gradient(135deg, #a855f7 0%, #7c3aed 50%, #4f46e5 100%)',
          boxShadow: '0 0 60px rgba(168,85,247,0.6), 0 0 120px rgba(168,85,247,0.3)',
          animation: 'aiSummaryCore 2s ease-in-out infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>✨</div>
      </div>

      {/* Text */}
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: '-0.01em' }}>
          {phase === 'thinking' ? 'Analysing Assessment' : phase === 'writing' ? 'Generating Report Content' : 'Finalising…'}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, animation: 'aiSummarySlide 0.4s ease' }}>
          {AI_PHASE_LABELS[phase]}
        </div>
        {findingCount > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(168,85,247,0.7)', fontFamily: 'var(--font-mono)' }}>
            {findingCount} findings · {phase === 'thinking' ? 'processing…' : 'composing…'}
          </div>
        )}
      </div>

      {/* Animated dots */}
      <div style={{ display: 'flex', gap: 8, marginTop: 36 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#a855f7',
            animation: `aiSummaryPulse 1.2s ease-in-out infinite ${i * 0.2}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProjectTabs({ project, findings, reports, counts, scopeRows, allUsers }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('Findings');
  const [sevFilter, setSevFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deletingFinding, setDeletingFinding] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  // AI summary generation state
  const [aiPhase, setAiPhase] = useState<AIPhase>('idle');
  const [aiError, setAiError] = useState('');
  const [execSummaryKey, setExecSummaryKey] = useState(0);
  const [attackNarrKey, setAttackNarrKey] = useState(0);
  const [aiExecSummary, setAiExecSummary] = useState<string | null>(null);
  const [aiAttackNarr, setAiAttackNarr] = useState<string | null>(null);

  const generateSummaryWithAI = useCallback(async () => {
    if (aiPhase !== 'idle') return;
    setAiError('');
    setAiPhase('thinking');
    try {
      const riskScore = findings.length === 0 ? 0 : Math.min(10,
        ((counts.critical || 0) * 10 + (counts.high || 0) * 7 + (counts.medium || 0) * 4 + (counts.low || 0) * 1) / Math.max(1, findings.length)
      );
      const ctx = {
        projectName: project.name,
        engagement: project.engagement || 'Web Application',
        findings: findings.map(f => ({ title: f.title, severity: f.severity, cvss: f.cvss })),
        counts,
        riskScore,
        startDate: project.startDate,
        endDate: project.endDate,
      };

      await new Promise(r => setTimeout(r, 600)); // brief phase pause
      setAiPhase('writing');

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'summary', context: ctx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI generation failed');

      const result = data.result as { executiveSummary: string; attackNarrative: string };
      setAiExecSummary(result.executiveSummary);
      setAiAttackNarr(result.attackNarrative);

      setAiPhase('done');
      await new Promise(r => setTimeout(r, 700));

      // Remount AutoSaveFields with new values, then save to DB
      setExecSummaryKey(k => k + 1);
      setAttackNarrKey(k => k + 1);

      // Persist to project
      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executiveSummary: result.executiveSummary,
          attackNarrative: result.attackNarrative,
        }),
      });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI generation failed');
    } finally {
      setAiPhase('idle');
    }
  }, [aiPhase, findings, counts, project]);

  async function handleDeleteFinding(findingId: string) {
    if (!confirm('Delete this finding permanently? This cannot be undone.')) return;
    setDeletingFinding(findingId);
    try {
      await fetch(`/api/findings/${findingId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeletingFinding(null);
    }
  }

  const initialMembers = useMemo(() => {
    try { return JSON.parse(project.members || '[]') as string[]; } catch { return []; }
  }, [project.members]);

  const filtered = useMemo(() => {
    return findings.filter(f => {
      const matchSev = sevFilter === 'all' || f.severity === sevFilter;
      const matchSearch = !search ||
        f.title.toLowerCase().includes(search.toLowerCase()) ||
        f.code.toLowerCase().includes(search.toLowerCase());
      return matchSev && matchSearch;
    });
  }, [findings, sevFilter, search]);

  const total = findings.length || 1;
  const resolved = findings.filter(f => f.status === 'resolved').length;
  const progress = Math.round((resolved / findings.length) * 100) || 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SummaryAIOverlay phase={aiPhase} findingCount={findings.length} />

      {/* Tab bar */}
      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === 'Findings' && (
              <span className="badge" style={{ marginLeft: 4 }}>{findings.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {/* ── FINDINGS TAB ── */}
        {activeTab === 'Findings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {SEV_ORDER.map(s => (
                <button
                  key={s}
                  onClick={() => setSevFilter(s)}
                  style={{
                    height: 28, padding: '0 12px', borderRadius: 100, border: '1px solid',
                    borderColor: sevFilter === s ? (s === 'all' ? 'var(--line-3)' : `var(--sev-${s})`) : 'var(--line-1)',
                    background: sevFilter === s ? (s === 'all' ? 'var(--bg-3)' : `var(--sev-${s}-bg)`) : 'transparent',
                    color: sevFilter === s ? (s === 'all' ? 'var(--ink-0)' : `var(--sev-${s})`) : 'var(--ink-2)',
                    fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {s === 'all' ? `All (${findings.length})` : `${s} (${counts[s] || 0})`}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ position: 'relative' }}>
                <Ico name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
                <input className="input" placeholder="Search findings…" value={search}
                  onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: 220 }} />
              </div>
            </div>

            {/* Table */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>ID</th>
                    <th>Title</th>
                    <th style={{ width: 110 }}>Severity</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th style={{ width: 70 }}>CVSS</th>
                    <th style={{ width: 140 }}>Assignee</th>
                    <th style={{ width: 110 }}>Discovered</th>
                    <th style={{ width: 48 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-3)' }}>No findings match the current filter</td></tr>
                  ) : filtered.map(f => (
                    <tr key={f.id}>
                      <td><span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{f.code}</span></td>
                      <td>
                        <Link href={`/projects/${project.id}/findings/${f.id}`} style={{ color: 'var(--ink-0)', textDecoration: 'none', fontWeight: 500 }}>{f.title}</Link>
                      </td>
                      <td><Sev level={f.severity} size="sm" /></td>
                      <td><StatusPill status={f.status} /></td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                          color: f.cvss >= 9 ? 'var(--sev-critical)' : f.cvss >= 7 ? 'var(--sev-high)' : f.cvss >= 4 ? 'var(--sev-medium)' : 'var(--ink-2)' }}>
                          {f.cvss.toFixed(1)}
                        </span>
                      </td>
                      <td>
                        {f.assignee ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Avatar name={f.assignee.name} size={22} />
                            <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>{f.assignee.name}</span>
                          </div>
                        ) : <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                          {f.discovered ? new Date(f.discovered).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <Link href={`/projects/${project.id}/findings/${f.id}`}
                            className="btn btn-ghost btn-sm"
                            style={{ width: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Edit finding">
                            <Ico name="pen" size={13} />
                          </Link>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ width: 28, padding: 0, color: deletingFinding === f.id ? 'var(--sev-critical)' : 'var(--ink-3)' }}
                            title="Delete finding"
                            disabled={deletingFinding === f.id}
                            onClick={() => handleDeleteFinding(f.id)}
                          >
                            <Ico name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'Overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>
            {/* Project info */}
            <div className="card" style={{ padding: 'var(--card-pad)' }}>
              <div style={{ marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Project Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    ['Code', project.code],
                    ['Engagement', project.engagement],
                    ['Status', project.status.replace(/-/g, ' ')],
                    ['Start date', project.startDate],
                    ['End date', project.endDate],
                    ['Lead', project.lead.name],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-1)', textAlign: 'right', textTransform: 'capitalize' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <hr className="hr" style={{ margin: '16px 0' }} />
              {/* Team members */}
              {initialMembers.length > 0 && (
                <>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>Team</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {allUsers.filter(u => initialMembers.includes(u.id)).map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)' }}>
                        <Avatar name={u.name} size={18} />
                        <span style={{ fontSize: 12, color: 'var(--ink-1)' }}>{u.name}</span>
                      </div>
                    ))}
                  </div>
                  <hr className="hr" style={{ margin: '0 0 16px' }} />
                </>
              )}
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Progress</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{resolved} of {findings.length} resolved</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-1)' }}>{progress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--status-resolved)' }} />
                </div>
              </div>
            </div>

            {/* Severity distribution */}
            <div className="card" style={{ padding: 'var(--card-pad)' }}>
              <div className="eyebrow" style={{ marginBottom: 16 }}>Severity Distribution</div>
              <div style={{ display: 'flex', height: 12, borderRadius: 100, overflow: 'hidden', background: 'var(--bg-3)', marginBottom: 20 }}>
                {(['critical', 'high', 'medium', 'low', 'info'] as const).map(s => (
                  (counts[s] || 0) > 0 && (
                    <div key={s} style={{ width: `${((counts[s] || 0) / total) * 100}%`, background: `var(--sev-${s})`, opacity: 0.9 }} title={`${counts[s]} ${s}`} />
                  )
                ))}
              </div>
              <SevCounts counts={counts} />
              <hr className="hr" style={{ margin: '16px 0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['critical', 'high', 'medium', 'low', 'info'] as const).map(s => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--sev-${s})`, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--ink-1)', textTransform: 'capitalize', flex: 1 }}>{s}</span>
                    <div style={{ width: 120, height: 4, borderRadius: 100, background: 'var(--bg-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${((counts[s] || 0) / total) * 100}%`, background: `var(--sev-${s})`, borderRadius: 100 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', width: 28, textAlign: 'right' }}>{counts[s] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {activeTab === 'Reports' && (
          <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link href={`/projects/${project.id}/report`} className="btn btn-primary btn-sm">
                <Ico name="paper" size={13} /> Generate Report
              </Link>
            </div>
            {reports.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>No reports generated yet</div>
            ) : reports.map(r => {
              const isExpanded = expandedReport === r.id;
              return (
                <div key={r.id} className="card" style={{ overflow: 'hidden' }}>
                  {/* Report header row */}
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Ico name="paper" size={16} style={{ color: 'var(--ink-2)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)', marginBottom: 3 }}>
                        {r.templateName || 'Pentest Report'} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginLeft: 6 }}>{r.version}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>by {r.author.name} · {r.code}</div>
                    </div>
                    <StatusPill status={r.status} />
                    <Link href={`/projects/${project.id}/report`} className="btn btn-ghost btn-sm" title="Preview report">
                      <Ico name="eye" size={13} />
                    </Link>
                    <button
                      className="btn btn-ghost btn-sm"
                      title={isExpanded ? 'Hide history' : 'Show version history'}
                      onClick={() => setExpandedReport(isExpanded ? null : r.id)}
                      style={{ gap: 5, color: isExpanded ? 'var(--ink-0)' : 'var(--ink-3)' }}
                    >
                      <Ico name="clock" size={13} />
                      History
                    </button>
                  </div>

                  {/* Rejection comment */}
                  {r.status === 'rejected' && r.reviewComment && (
                    <div style={{
                      margin: '0 20px 14px', padding: '8px 12px',
                      background: 'rgba(255,92,58,0.08)', border: '1px solid rgba(255,92,58,0.2)',
                      borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--sev-critical)', lineHeight: 1.5,
                    }}>
                      <span style={{ fontWeight: 500 }}>Rejection comment:</span> {r.reviewComment}
                    </div>
                  )}

                  {/* Version history panel */}
                  {isExpanded && (
                    <div style={{
                      borderTop: '1px solid var(--line-1)',
                      padding: '18px 20px',
                      background: 'var(--bg-1)',
                    }}>
                      <div className="eyebrow" style={{ marginBottom: 14 }}>Version History</div>
                      <ReportVersionHistory reportId={r.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SCOPE TAB ── */}
        {activeTab === 'Scope' && (
          <div style={{ maxWidth: 780 }}>
            <ScopeManager initial={scopeRows} projectId={project.id} />
          </div>
        )}

        {/* ── REPORT CONTENT TAB ── */}
        {activeTab === 'Report Content' && (
          <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Header row: info banner + AI button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--accent)' }}>
                <Ico name="info" size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  All fields below appear in the generated PDF report. Changes are auto-saved as you type. Markdown is supported.
                </span>
              </div>
              <button
                className="btn btn-sm"
                onClick={generateSummaryWithAI}
                disabled={aiPhase !== 'idle'}
                style={{ whiteSpace: 'nowrap', flexShrink: 0, gap: 6 }}
              >
                <span style={{ fontSize: 13 }}>✨</span>
                {aiPhase !== 'idle' ? 'Generating…' : 'Generate with AI'}
              </button>
            </div>

            {/* AI error banner */}
            {aiError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,92,58,0.08)', border: '1px solid rgba(255,92,58,0.25)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--sev-critical)' }}>
                <strong>AI error:</strong> {aiError}
              </div>
            )}

            <div className="card" style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 16 }}>Narrative Content</div>

              <AutoSaveField
                key={`exec-${execSummaryKey}`}
                label="Executive Summary"
                hint="High-level overview for stakeholders. Written in plain language."
                value={aiExecSummary !== null && execSummaryKey > 0 ? aiExecSummary : (project.executiveSummary || '')}
                field="executiveSummary"
                projectId={project.id}
                rows={7}
                placeholder="Over X weeks, a grey-box penetration test was conducted against… The assessment identified N critical, N high, and N medium severity findings…"
              />

              <AutoSaveField
                key={`narr-${attackNarrKey}`}
                label="Attack Narrative"
                hint="Walk-through of key attack chains discovered during the engagement."
                value={aiAttackNarr !== null && attackNarrKey > 0 ? aiAttackNarr : (project.attackNarrative || '')}
                field="attackNarrative"
                projectId={project.id}
                rows={8}
                placeholder="During the engagement, the team identified an attack chain that led to full domain compromise:&#10;&#10;1. Initial access via SQL injection on `/api/login`&#10;2. Privilege escalation through…&#10;&#10;```bash&#10;# Example command&#10;curl -X POST https://target.com/api/login -d &quot;user=admin&apos; OR 1=1--&quot;&#10;```"
              />
            </div>

            <div className="card" style={{ padding: 'var(--card-pad)' }}>
              <div className="eyebrow" style={{ marginBottom: 16 }}>Team Assignment</div>
              <MembersManager initial={initialMembers} allUsers={allUsers} projectId={project.id} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
