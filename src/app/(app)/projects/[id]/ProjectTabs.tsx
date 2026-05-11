'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ico } from '@/components/chrome/icons';
import { Avatar } from '@/components/chrome/icons';
import { Sev, StatusPill, SevCounts } from '@/components/ui/SevBadge';
import { ReportVersionHistory } from '@/components/reports/ReportVersionHistory';
import { LivePresence } from '@/components/collab/LivePresence';

type ScopeRow = { asset: string; type: string; notes: string };

type Finding = {
  id: string;
  code: string;
  title: string;
  severity: string;
  status: string;
  cvss: number;
  assetOwner: string;
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
  notes: string;
  lead: { id: string; name: string; initials: string; role: string };
  // Multi-engagement fields
  targetCode?: string;
  engagementYear?: string;
  previousEngagementId?: string | null;
};

type EngagementSibling = {
  id: string; code: string; name: string; status: string;
  engagementYear: string; startDate: string; endDate: string;
  findingCount: number; resolvedCount: number; isCurrent: boolean;
};

type CarryoverFinding = {
  id: string; code: string; title: string; severity: string; status: string;
};

type Counts = Record<string, number>;

type Props = {
  project: Project;
  findings: Finding[];
  reports: Report[];
  counts: Counts;
  scopeRows: ScopeRow[];
  allUsers: Member[];
  engagementSiblings?: EngagementSibling[];
  carryoverFindings?: CarryoverFinding[];
  backSlug?: string;
};

const TABS = ['Overview', 'Findings', 'Reports', 'Scope', 'Report Content', 'Notes'] as const;
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
        @keyframes noteDot { 0%,80%,100%{transform:scale(0);opacity:0.3} 40%{transform:scale(1);opacity:1} }
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
export function ProjectTabs({ project, findings, reports, counts, scopeRows, allUsers, engagementSiblings = [], carryoverFindings = [], backSlug: _backSlug }: Props) {
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

      {/* Tab content — Notes gets its own full-screen layout */}
      {activeTab === 'Notes' && (
        <ProjectNotesEditor projectId={project.id} initialNotes={project.notes ?? ''} />
      )}
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: activeTab === 'Notes' ? 'none' : undefined }}>

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
              <LivePresence entity={`project:${project.id}`} />
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

        {/* Notes tab is rendered outside this container (full-screen) */}


      </div>
    </div>
  );
}

// ── Notes markdown renderer (base64-aware) ────────────────────────────────────
function buildNotesHtml(md: string): string {
  if (!md?.trim()) return '<p style="color:var(--ink-3);font-style:italic;padding:4px 0">Nothing written yet…</p>';

  function escH(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inlineH(text: string): string {
    let h = text;
    h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
      if (!src) return '';
      const escaped = src.startsWith('data:') ? src : escH(src);
      return `<span style="display:block;margin:6px 0"><img src="${escaped}" alt="${escH(alt)}" style="max-width:100%;border-radius:4px;border:1px solid var(--line-2)" />${alt ? `<span style="display:block;font-size:11px;color:var(--ink-3);margin-top:3px">${escH(alt)}</span>` : ''}</span>`;
    });
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#5B9BD5;text-decoration:underline">$1</a>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    h = h.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    h = h.replace(/`([^`\n]+)`/g, '<code style="font-family:var(--font-mono);font-size:12px;background:rgba(255,255,255,.1);padding:1px 5px;border-radius:3px">$1</code>');
    return h;
  }

  const parts: string[] = [];
  const segs = md.split(/(```[\w]*\n?[\s\S]*?```)/g);
  for (const seg of segs) {
    const fence = seg.match(/^```([\w]*)\n?([\s\S]*?)```$/);
    if (fence) {
      const lang = fence[1] || '';
      parts.push(`<pre style="background:#0F1115;color:#E6E6E6;font-family:var(--font-mono);font-size:12.5px;line-height:1.55;padding:12px 16px;border-radius:6px;margin:8px 0;white-space:pre-wrap;word-break:break-word">${lang ? `<div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#7A8390;margin-bottom:8px">${escH(lang)}</div>` : ''}${escH(fence[2].trimEnd())}</pre>`);
      continue;
    }
    const lines = seg.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) { i++; continue; }
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^###\s+(.*)/))) { parts.push(`<h3 style="font-size:14px;font-weight:600;margin:14px 0 4px;color:var(--ink-0)">${inlineH(m[1])}</h3>`); i++; continue; }
      if ((m = line.match(/^##\s+(.*)/))) { parts.push(`<h2 style="font-size:16px;font-weight:700;margin:16px 0 4px;color:var(--ink-0);border-bottom:1px solid var(--line-1);padding-bottom:4px">${inlineH(m[1])}</h2>`); i++; continue; }
      if ((m = line.match(/^#\s+(.*)/))) { parts.push(`<h1 style="font-size:20px;font-weight:700;margin:18px 0 6px;color:var(--ink-0)">${inlineH(m[1])}</h1>`); i++; continue; }
      if (line.startsWith('> ')) { parts.push(`<blockquote style="border-left:3px solid var(--line-3);margin:6px 0;padding:4px 12px;color:var(--ink-2);font-style:italic">${inlineH(line.slice(2))}</blockquote>`); i++; continue; }
      if (/^[-*+]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
          items.push(`<li style="margin-bottom:3px">${inlineH(lines[i].trim().replace(/^[-*+]\s/, ''))}</li>`);
          i++;
        }
        parts.push(`<ul style="margin:6px 0;padding-left:20px">${items.join('')}</ul>`);
        continue;
      }
      if (/^\d+\.\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          items.push(`<li style="margin-bottom:3px">${inlineH(lines[i].trim().replace(/^\d+\.\s/, ''))}</li>`);
          i++;
        }
        parts.push(`<ol style="margin:6px 0;padding-left:20px">${items.join('')}</ol>`);
        continue;
      }
      parts.push(`<p style="margin:4px 0;line-height:1.65">${inlineH(line)}</p>`);
      i++;
    }
  }
  return parts.join('');
}

const NOTES_TOOLBAR = [
  { icon: 'bold', label: 'Bold', ins: '**bold**' },
  { icon: 'italic', label: 'Italic', ins: '*italic*' },
  { icon: 'heading', label: 'Heading', ins: '## Heading' },
  { icon: 'list', label: 'Bullets', ins: '- item\n- item\n- item' },
  { icon: 'codeblock', label: 'Code block', ins: '```bash\ncode here\n```' },
  { icon: 'quote', label: 'Blockquote', ins: '> quote' },
];

// ── Parse embedded base64 images from notes markdown ─────────────────────────
type NoteImage = { alt: string; dataUrl: string; idx: number };
function parseNoteImages(md: string): NoteImage[] {
  const regex = /!\[([^\]]*)\]\((data:[^)]{10,})\)/g;
  const results: NoteImage[] = [];
  let match; let idx = 0;
  while ((match = regex.exec(md)) !== null) {
    results.push({ alt: match[1] || `Screenshot ${idx + 1}`, dataUrl: match[2], idx: idx++ });
  }
  return results;
}

// ── Full-screen Notes markdown editor ────────────────────────────────────────
function ProjectNotesEditor({ projectId, initialNotes }: { projectId: string; initialNotes: string }) {
  const [notes, setNotes] = React.useState(initialNotes);
  const [editorTab, setEditorTab] = React.useState<'Write' | 'Preview'>('Write');
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dragOver, setDragOver] = React.useState(false);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [remoteTyping, setRemoteTyping] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const typingThrottle = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypedAt = React.useRef<number>(0);
  const lastSaved = React.useRef(initialNotes);

  // Derived: images embedded in current notes
  const embeddedImages = React.useMemo(() => parseNoteImages(notes), [notes]);

  function insertAtCursor(text: string, base?: string) {
    const val = base ?? notes;
    const ta = textareaRef.current;
    if (!ta) { const n = val + text; setNotes(n); schedSave(n); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = val.slice(0, s) + text + val.slice(e);
    setNotes(next);
    schedSave(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + text.length, s + text.length); });
  }

  function schedSave(val: string) {
    setSaveStatus('idle');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(val), 1200);
  }

  async function persist(val: string) {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: val }),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
      if (res.ok) lastSaved.current = val;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2500);
    } catch { setSaveStatus('error'); }
  }

  function handleChange(val: string) {
    setNotes(val);
    lastTypedAt.current = Date.now();
    setConflict(null);
    schedSave(val);
    // Throttle typing broadcasts to every 2s
    if (!typingThrottle.current) {
      fetch(`/api/collab/notes:${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'notes' }),
      }).catch(() => {});
      typingThrottle.current = setTimeout(() => { typingThrottle.current = null; }, 2000);
    }
  }

  function embedFile(file: File, atPos?: number) {
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      const label = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || 'screenshot';
      const tag = `\n![${label}](${dataUrl})\n`;
      const ta = textareaRef.current;
      const pos = atPos ?? (ta ? ta.selectionStart : notes.length);
      const current = notes; // capture at read time
      const next = current.slice(0, pos) + tag + current.slice(pos);
      setNotes(next);
      schedSave(next);
      requestAnimationFrame(() => { if (ta) { ta.focus(); ta.setSelectionRange(pos + tag.length, pos + tag.length); } });
    };
    reader.readAsDataURL(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const img = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/'));
    if (!img) return;
    e.preventDefault();
    const blob = img.getAsFile();
    if (!blob) return;
    const pos = textareaRef.current?.selectionStart ?? notes.length;
    embedFile(new File([blob], `screenshot-${embeddedImages.length + 1}.png`, { type: blob.type }), pos);
  }

  function handleDragOver(e: React.DragEvent) {
    if (Array.from(e.dataTransfer.items).some(it => it.type.startsWith('image/'))) {
      e.preventDefault(); setDragOver(true);
    }
  }
  function handleDragLeave() { setDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => embedFile(f));
  }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files || []).forEach(f => embedFile(f));
    e.target.value = '';
  }

  // SSE real-time sync (replaces polling)
  React.useEffect(() => {
    const typingTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const es = new EventSource(`/api/collab/notes:${projectId}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notes_update') {
          if (data.notes === lastSaved.current) return;
          const idleSince = Date.now() - lastTypedAt.current;
          if (idleSince > 5000) {
            setNotes(data.notes);
            lastSaved.current = data.notes;
            setConflict(null);
          } else {
            setConflict(data.notes);
          }
        }
        if (data.type === 'typing' && data.field === 'notes') {
          setRemoteTyping(data.userName || 'Someone');
          setTimeout(() => setRemoteTyping(p => p === data.userName ? null : p), 3500);
        }
        if (data.type === 'typing' && data.field === null) {
          setRemoteTyping(null);
        }
      } catch { /* ignore */ }
    };

    pollTimer.current = null as unknown as ReturnType<typeof setInterval>; // keep ref but don't poll
    return () => {
      es.close();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [projectId]);

  // Remove a specific image from the notes string
  function removeImage(dataUrl: string) {
    // Escape the data URL for regex (it's a data: URL so just string replace)
    const escaped = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = notes.replace(new RegExp(`\\n?!\\[[^\\]]*\\]\\(${escaped}\\)\\n?`, 'g'), '\n').replace(/\n{3,}/g, '\n\n');
    setNotes(next);
    schedSave(next);
  }

  // Re-insert an existing image reference at cursor
  function reinsertImage(img: NoteImage) {
    insertAtCursor(`\n![${img.alt}](${img.dataUrl})\n`);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 16px', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-0)', flexShrink: 0 }}>
        {(['Write', 'Preview'] as const).map(t => (
          <button key={t} onClick={() => setEditorTab(t)} style={{
            padding: '5px 10px', borderRadius: 'var(--r-xs)',
            background: editorTab === t ? 'var(--bg-2)' : 'transparent',
            border: `1px solid ${editorTab === t ? 'var(--line-2)' : 'transparent'}`,
            color: editorTab === t ? 'var(--ink-0)' : 'var(--ink-2)',
            fontSize: 12, cursor: 'pointer', transition: 'all .1s',
          }}>{t}</button>
        ))}
        <div style={{ width: 1, height: 18, background: 'var(--line-2)', margin: '0 4px' }} />
        {editorTab === 'Write' && (
          <div style={{ display: 'flex', gap: 2 }}>
            {NOTES_TOOLBAR.map(({ icon, label, ins }) => (
              <button key={icon} title={label}
                onClick={() => insertAtCursor('\n' + ins + '\n')}
                style={{ width: 26, height: 26, borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ico name={icon} size={13} />
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {remoteTyping && (
          <span style={{ fontSize: 11, color: 'var(--accent)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: `noteDot 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
            </span>
            {remoteTyping} is typing
          </span>
        )}
        <LivePresence entity={`project-notes:${projectId}`} />
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: saveStatus === 'saved' ? 'var(--status-resolved)' : saveStatus === 'saving' ? 'var(--ink-3)' : saveStatus === 'error' ? 'var(--sev-critical)' : 'var(--ink-4)' }}>
          {saveStatus === 'saving' ? 'saving…' : saveStatus === 'saved' ? '✓ saved' : saveStatus === 'error' ? 'error' : `${notes.length} chars`}
        </div>
      </div>

      {conflict !== null && (
        <div style={{ padding: '8px 16px', background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-1)', flex: 1 }}>⚠️ <strong>Someone else updated the notes</strong> while you were typing.</span>
          <button onClick={() => { setNotes(conflict); lastSaved.current = conflict; setConflict(null); }} className="btn btn-sm" style={{ fontSize: 11 }}>Use theirs</button>
          <button onClick={() => { persist(notes); setConflict(null); }} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Keep mine</button>
        </div>
      )}

      {/* Editor / Preview area */}
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
        onDragOver={editorTab === 'Write' ? handleDragOver : undefined}
        onDragLeave={editorTab === 'Write' ? handleDragLeave : undefined}
        onDrop={editorTab === 'Write' ? handleDrop : undefined}
      >
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(91,155,213,.12)', border: '2px dashed #5B9BD5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', borderRadius: 4,
          }}>
            <div style={{ textAlign: 'center', color: '#5B9BD5', fontSize: 14, fontWeight: 600 }}>
              <div style={{ fontSize: 28 }}>🖼</div>
              <div style={{ marginTop: 8 }}>Drop image to embed inline</div>
            </div>
          </div>
        )}
        {editorTab === 'Write' ? (
          <textarea
            ref={textareaRef}
            className="thin-scroll"
            value={notes}
            onChange={e => handleChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={`# Engagement Notes\n\n## Recon Findings\n- Target runs nginx 1.18 with default error pages\n- S3 bucket enumerated: dev-backups.target.com (public)\n\n## Client Context\n- Pentest scope agreed 2026-04-10\n- Out of scope: payment gateway (third-party)\n\n## Tester Observations\n- Auth bypass via role parameter manipulation on /admin\n- API keys found in JS bundle at /static/main.js\n\n## Notes for AI\n- Focus finding descriptions on business impact\n- Client is a fintech — emphasise PCI-DSS implications\n\nTip: paste or drag-and-drop screenshots to embed them inline.`}
            style={{
              display: 'block', width: '100%', height: '100%',
              padding: '20px 28px', background: 'var(--bg-0)', border: 'none', outline: 'none',
              color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', fontSize: 13.5,
              lineHeight: 1.75, resize: 'none', boxSizing: 'border-box',
            }}
          />
        ) : (
          <div
            className="thin-scroll"
            style={{ height: '100%', overflowY: 'auto', padding: '20px 28px', maxWidth: 860, color: 'var(--ink-0)', fontSize: 14, lineHeight: 1.7, boxSizing: 'border-box' }}
            dangerouslySetInnerHTML={{ __html: buildNotesHtml(notes) }}
          />
        )}
      </div>

      {/* ── Screenshot / Evidence panel ── */}
      <div style={{ borderTop: '1px solid var(--line-1)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 6px' }}>
          <span className="eyebrow" style={{ fontSize: 9, flex: 1 }}>
            Screenshots{embeddedImages.length > 0 ? ` · ${embeddedImages.length} embedded` : ''}
          </span>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileInput} style={{ display: 'none' }} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-sm btn-ghost"
            style={{ height: 24, padding: '0 8px', fontSize: 11, gap: 4 }}
          >
            <Ico name="plus" size={11} /> Upload image
          </button>
        </div>

        {embeddedImages.length === 0 ? (
          <div style={{ padding: '2px 16px 10px', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.6 }}>
            Paste <kbd style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 3, padding: '0 4px', fontSize: 11 }}>⌘V</kbd> or drag-and-drop an image into the editor to embed it inline.
          </div>
        ) : (
          <div className="thin-scroll" style={{ display: 'flex', gap: 10, padding: '0 16px 12px', overflowX: 'auto' }}>
            {embeddedImages.map((img) => (
              <div key={img.idx} style={{
                flexShrink: 0, width: 130,
                border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)',
                background: 'var(--bg-0)', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Thumbnail */}
                <div style={{ position: 'relative', height: 76, background: 'var(--bg-2)', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.dataUrl} alt={img.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {/* Remove button */}
                  <button
                    onClick={() => removeImage(img.dataUrl)}
                    title="Remove from notes"
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,.65)', border: 'none', cursor: 'pointer',
                      color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                  {/* Re-insert button */}
                  <button
                    onClick={() => reinsertImage(img)}
                    title="Insert reference at cursor"
                    style={{
                      position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,.65)', border: 'none', cursor: 'pointer',
                      color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Ico name="plus" size={9} />
                  </button>
                </div>
                {/* Caption */}
                <div style={{ padding: '5px 7px', fontSize: 10, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {img.alt}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Engagements Tab ──────────────────────────────────────────────────────────

const SEV_COLORS_ENG: Record<string, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)',
  medium: 'var(--sev-medium)', low: 'var(--sev-low)', info: 'var(--sev-info)',
};

function EngagementsTab({
  project, engagementSiblings, carryoverFindings,
}: {
  project: Project;
  engagementSiblings: EngagementSibling[];
  carryoverFindings: CarryoverFinding[];
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  async function handleNewEngagement() {
    setCreating(true);
    // Navigate to new project form with pre-filled targetCode
    const tc = project.targetCode || project.code;
    router.push(`/projects/new?targetCode=${encodeURIComponent(tc)}&previousEngagementId=${project.id}&from=${encodeURIComponent(project.name)}`);
  }

  const hasSiblings = engagementSiblings.length > 0;
  const prevEngId = project.previousEngagementId;
  const prevSibling = engagementSiblings.find(s => s.id === prevEngId);

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 4 }}>
            {project.targetCode ? (
              <>Engagement history for <span className="mono" style={{ fontSize: 13, color: 'var(--accent)' }}>{project.targetCode}</span></>
            ) : 'Engagements'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {hasSiblings
              ? `${engagementSiblings.length} engagement${engagementSiblings.length !== 1 ? 's' : ''} found for this target · set a Target Code to link engagements`
              : 'Set a Target Code on this project to group related yearly engagements together.'}
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleNewEngagement}
          disabled={creating}
          style={{ flexShrink: 0 }}
        >
          <Ico name="plus" size={13} />
          {creating ? 'Opening…' : 'New re-engagement'}
        </button>
      </div>

      {/* Engagement timeline */}
      {hasSiblings ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Engagement Timeline</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>All pentests for this target · sorted newest first</div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 24 }}></th>
                <th style={{ width: 100 }}>Code</th>
                <th>Engagement</th>
                <th style={{ width: 80 }}>Year</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 80, textAlign: 'center' }}>Findings</th>
                <th style={{ width: 80, textAlign: 'center' }}>Resolved</th>
                <th style={{ width: 90, textAlign: 'center' }}>Res. Rate</th>
                <th style={{ width: 80 }}>Period</th>
              </tr>
            </thead>
            <tbody>
              {engagementSiblings.map((eng, idx) => {
                const resRate = eng.findingCount > 0 ? Math.round((eng.resolvedCount / eng.findingCount) * 100) : 0;
                return (
                  <tr key={eng.id} style={{ background: eng.isCurrent ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined }}>
                    <td style={{ paddingLeft: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* Timeline dot + connector */}
                        <div style={{ position: 'relative' }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: eng.isCurrent ? 'var(--accent)' : 'var(--bg-3)',
                            border: `2px solid ${eng.isCurrent ? 'var(--accent)' : 'var(--line-2)'}`,
                          }} />
                          {idx < engagementSiblings.length - 1 && (
                            <div style={{
                              position: 'absolute', left: '50%', top: '100%',
                              width: 2, height: 24, transform: 'translateX(-50%)',
                              background: 'var(--line-1)',
                            }} />
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <Link href={`/projects/${eng.id}`} style={{ textDecoration: 'none' }}>
                        <span className="mono" style={{ fontSize: 11, color: eng.isCurrent ? 'var(--accent)' : 'var(--ink-2)' }}>
                          {eng.code}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/projects/${eng.id}`} style={{ textDecoration: 'none' }}>
                        <span style={{ fontWeight: eng.isCurrent ? 600 : 400, color: 'var(--ink-0)', fontSize: 13 }}>
                          {eng.name}
                        </span>
                      </Link>
                      {eng.isCurrent && (
                        <span style={{
                          marginLeft: 8, fontSize: 9, fontFamily: 'var(--font-mono)',
                          color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          padding: '1px 6px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>current</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>
                        {eng.engagementYear || '—'}
                      </span>
                    </td>
                    <td><StatusPill status={eng.status} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>
                        {eng.findingCount}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: eng.resolvedCount > 0 ? 'var(--status-resolved)' : 'var(--ink-3)' }}>
                        {eng.resolvedCount}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: resRate >= 70 ? 'var(--status-resolved)' : resRate >= 40 ? 'var(--sev-medium)' : 'var(--sev-high)' }}>
                          {eng.findingCount > 0 ? `${resRate}%` : '—'}
                        </span>
                        {eng.findingCount > 0 && (
                          <div style={{ width: 40, height: 3, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                            <div style={{ width: `${resRate}%`, height: '100%', background: resRate >= 70 ? 'var(--status-resolved)' : 'var(--sev-medium)', borderRadius: 100 }} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {eng.startDate} – {eng.endDate}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* No-engagement placeholder */
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>📅</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500, marginBottom: 6 }}>
            No linked engagements yet
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 380, margin: '0 auto 16px' }}>
            Set a <strong>Target Code</strong> when editing this project to group yearly engagements together.
            Then use the "New re-engagement" button when you run the next annual pentest.
          </div>
          <Link href={`/projects/${project.id}/edit`} className="btn btn-ghost btn-sm">
            <Ico name="settings" size={13} /> Edit project to set Target Code
          </Link>
        </div>
      )}

      {/* Carry-over findings from previous engagement */}
      {carryoverFindings.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>Carry-over from Previous Engagement</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                {carryoverFindings.length} finding{carryoverFindings.length !== 1 ? 's' : ''} from{' '}
                {prevSibling ? (
                  <Link href={`/projects/${prevEngId}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    {prevSibling.code} ({prevSibling.engagementYear || prevSibling.startDate})
                  </Link>
                ) : 'previous engagement'}{' '}
                still unresolved at time of this engagement
              </div>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
              fontFamily: 'var(--font-mono)', background: 'var(--sev-high-bg)',
              color: 'var(--sev-high)', border: '1px solid color-mix(in srgb, var(--sev-high) 20%, transparent)',
            }}>
              {carryoverFindings.filter(f => f.severity === 'critical' || f.severity === 'high').length} crit/high
            </span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Code</th>
                <th>Title</th>
                <th style={{ width: 110 }}>Severity</th>
                <th style={{ width: 130 }}>Status in prev.</th>
              </tr>
            </thead>
            <tbody>
              {carryoverFindings.map(f => (
                <tr key={f.id}>
                  <td><span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{f.code}</span></td>
                  <td>
                    <Link
                      href={`/projects/${prevEngId}/findings/${f.id}`}
                      style={{ color: 'var(--ink-0)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}
                    >
                      {f.title}
                    </Link>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: SEV_COLORS_ENG[f.severity] || 'var(--ink-2)',
                      background: `color-mix(in srgb, ${SEV_COLORS_ENG[f.severity] || 'var(--ink-2)'} 10%, transparent)`,
                      padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{f.severity}</span>
                  </td>
                  <td><StatusPill status={f.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Setup guide when no targetCode */}
      {!project.targetCode && (
        <div style={{ padding: '16px 18px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 6 }}>
            How multi-engagement works
          </div>
          <ol style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Edit this project and set a <strong>Target Code</strong> (e.g. <code>WEBAPP-CORP</code>) — all engagements for the same target share this code.</li>
            <li>Use <strong>"New re-engagement"</strong> (above) to kick off next year's pentest — it auto-links to this project.</li>
            <li>The new engagement shows <strong>carry-over findings</strong> — vulnerabilities from this year that weren't fixed.</li>
            <li>Year-on-year <strong>remediation rate</strong> is tracked automatically in the timeline above.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Asset Owner Tab ───────────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  critical: 'var(--sev-critical)',
  high:     'var(--sev-high)',
  medium:   'var(--sev-medium)',
  low:      'var(--sev-low)',
  info:     'var(--sev-info)',
};
const SEV_KEYS = ['critical', 'high', 'medium', 'low', 'info'] as const;

function riskScore(sev: Record<string, number>, total: number): number {
  if (total === 0) return 0;
  const w = (sev.critical || 0) * 10 + (sev.high || 0) * 7 + (sev.medium || 0) * 4 + (sev.low || 0) * 1;
  return Math.min(10, w / Math.max(total, 1));
}

function RiskBadge({ score }: { score: number }) {
  const color = score >= 8 ? 'var(--sev-critical)' : score >= 5 ? 'var(--sev-high)' : score >= 2 ? 'var(--sev-medium)' : 'var(--status-resolved)';
  const label = score >= 8 ? 'Critical' : score >= 5 ? 'High' : score >= 2 ? 'Medium' : 'Low';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
      color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      padding: '2px 7px', borderRadius: 100,
    }}>{label} {score.toFixed(1)}</span>
  );
}

function MiniSevBar({ sev, total }: { sev: Record<string, number>; total: number }) {
  if (total === 0) return <div style={{ height: 3, borderRadius: 100, background: 'var(--bg-3)' }} />;
  return (
    <div style={{ display: 'flex', height: 3, borderRadius: 100, overflow: 'hidden', background: 'var(--bg-3)' }}>
      {SEV_KEYS.filter(k => (sev[k] || 0) > 0).map(k => (
        <div key={k} style={{ width: `${((sev[k] || 0) / total) * 100}%`, background: SEV_COLORS[k] }} />
      ))}
    </div>
  );
}

function AssetOwnerTab({ findings, projectId }: { findings: Finding[]; projectId: string }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  type OwnerStats = {
    name: string;
    total: number;
    sev: Record<string, number>;
    open: number;
    inProgress: number;
    resolved: number;
    resRate: number;
    risk: number;
    findings: Finding[];
  };

  const ownerMap: Record<string, Finding[]> = {};
  for (const f of findings) {
    const key = f.assetOwner?.trim() || '(Unattributed)';
    if (!ownerMap[key]) ownerMap[key] = [];
    ownerMap[key].push(f);
  }

  const owners: OwnerStats[] = Object.entries(ownerMap).map(([name, fList]) => {
    const sev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    let open = 0, inProgress = 0, resolved = 0;
    for (const f of fList) {
      if (f.severity in sev) sev[f.severity]++;
      if (f.status === 'resolved' || f.status === 'accepted') resolved++;
      else if (f.status === 'in-progress' || f.status === 'in-review') inProgress++;
      else open++;
    }
    const total = fList.length;
    const resRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    return { name, total, sev, open, inProgress, resolved, resRate, risk: riskScore(sev, total), findings: fList };
  }).sort((a, b) => b.risk - a.risk);

  const namedOwners = owners.filter(o => o.name !== '(Unattributed)');
  const totalOwners = namedOwners.length;
  const mostExposed = owners.length > 0 ? owners.reduce((best, o) =>
    ((o.sev.critical || 0) + (o.sev.high || 0)) > ((best.sev.critical || 0) + (best.sev.high || 0)) ? o : best
  ) : null;
  const avgResRate = owners.length > 0
    ? Math.round(owners.reduce((s, o) => s + o.resRate, 0) / owners.length)
    : 0;
  const totalUnresolved = owners.reduce((s, o) => s + o.open + o.inProgress, 0);
  const totalCritHigh = owners.reduce((s, o) => s + (o.sev.critical || 0) + (o.sev.high || 0), 0);

  if (findings.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--ink-3)', fontSize: 13, flexDirection: 'column', gap: 8 }}>
        <Ico name="folder" size={28} style={{ opacity: 0.2 }} />
        <span>No findings yet. Add findings and set Asset Owner to see breakdown.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── KPI strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--line-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        {[
          {
            label: 'Asset Owners',
            value: totalOwners,
            sub: owners.find(o => o.name === '(Unattributed)')
              ? `+ ${owners.find(o => o.name === '(Unattributed)')!.total} unattributed`
              : 'all findings attributed',
            color: 'var(--ink-0)',
          },
          {
            label: 'Most Exposed Owner',
            value: mostExposed ? mostExposed.name.split(' ').slice(0, 2).join(' ') : '—',
            sub: mostExposed ? `${(mostExposed.sev.critical || 0) + (mostExposed.sev.high || 0)} crit/high findings` : '',
            color: (mostExposed && ((mostExposed.sev.critical || 0) > 0)) ? 'var(--sev-critical)' : 'var(--sev-high)',
            isText: true,
          },
          {
            label: 'Avg Resolution Rate',
            value: `${avgResRate}%`,
            sub: `across ${owners.length} owner${owners.length !== 1 ? 's' : ''}`,
            color: avgResRate >= 70 ? 'var(--status-resolved)' : avgResRate >= 40 ? 'var(--sev-medium)' : 'var(--sev-high)',
          },
          {
            label: 'Total Unresolved',
            value: totalUnresolved,
            sub: `${totalCritHigh} crit/high open`,
            color: totalCritHigh > 0 ? 'var(--sev-critical)' : totalUnresolved > 0 ? 'var(--sev-medium)' : 'var(--status-resolved)',
          },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--bg-0)', padding: '16px 20px' }}>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 9 }}>{kpi.label}</div>
            <div style={{
              fontSize: kpi.isText ? 18 : 26, fontWeight: 700,
              fontFamily: kpi.isText ? 'var(--font-sans)' : 'var(--font-mono)',
              color: kpi.color, letterSpacing: kpi.isText ? '-0.01em' : '-0.03em', lineHeight: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 5 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Per-owner table ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
          <div className="eyebrow" style={{ marginBottom: 2 }}>Breakdown by Asset Owner</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            Click a row to expand findings · Set owner in individual findings
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Asset Owner</th>
              <th style={{ width: 60, textAlign: 'center' }}>Total</th>
              <th style={{ width: 44, textAlign: 'center' }}>C</th>
              <th style={{ width: 44, textAlign: 'center' }}>H</th>
              <th style={{ width: 44, textAlign: 'center' }}>M</th>
              <th style={{ width: 44, textAlign: 'center' }}>L</th>
              <th style={{ width: 44, textAlign: 'center' }}>I</th>
              <th style={{ width: 70, textAlign: 'center' }}>Open</th>
              <th style={{ width: 80, textAlign: 'center' }}>Resolved</th>
              <th style={{ width: 90, textAlign: 'center' }}>Res. Rate</th>
              <th style={{ width: 130 }}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {owners.map(owner => (
              <React.Fragment key={owner.name}>
                <tr
                  onClick={() => setExpanded(expanded === owner.name ? null : owner.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Ico
                        name={expanded === owner.name ? 'chevDown' : 'chevRight'}
                        size={12}
                        style={{ color: 'var(--ink-3)', flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: owner.name === '(Unattributed)' ? 'var(--ink-3)' : 'var(--ink-0)' }}>
                          {owner.name}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <MiniSevBar sev={owner.sev} total={owner.total} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{owner.total}</span>
                  </td>
                  {SEV_KEYS.map(k => (
                    <td key={k} style={{ textAlign: 'center' }}>
                      {(owner.sev[k] || 0) > 0 ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: SEV_COLORS[k] }}>
                          {owner.sev[k]}
                        </span>
                      ) : <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>—</span>}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: owner.open > 0 ? 'var(--sev-medium)' : 'var(--ink-3)' }}>
                      {owner.open + owner.inProgress}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: owner.resolved > 0 ? 'var(--status-resolved)' : 'var(--ink-3)' }}>
                      {owner.resolved}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: owner.resRate >= 70 ? 'var(--status-resolved)' : owner.resRate >= 40 ? 'var(--sev-medium)' : 'var(--sev-high)' }}>
                        {owner.resRate}%
                      </span>
                      <div style={{ width: 44, height: 3, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                        <div style={{ width: `${owner.resRate}%`, height: '100%', background: owner.resRate >= 70 ? 'var(--status-resolved)' : 'var(--sev-medium)', borderRadius: 100 }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <RiskBadge score={owner.risk} />
                  </td>
                </tr>

                {/* Expanded finding rows */}
                {expanded === owner.name && owner.findings.map(f => (
                  <tr key={f.id} style={{ background: 'var(--bg-2)' }}>
                    <td colSpan={2} style={{ paddingLeft: 44 }}>
                      <Link
                        href={`/projects/${projectId}/findings/${f.id}`}
                        style={{ color: 'var(--ink-0)', textDecoration: 'none', fontWeight: 500, fontSize: 12 }}
                        onClick={e => e.stopPropagation()}
                      >
                        {f.title}
                      </Link>
                      <span className="mono" style={{ marginLeft: 8, fontSize: 10, color: 'var(--ink-3)' }}>{f.code}</span>
                    </td>
                    {SEV_KEYS.map(k => (
                      <td key={k} style={{ textAlign: 'center' }}>
                        {f.severity === k ? (
                          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: SEV_COLORS[k] }}>●</span>
                        ) : null}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      {f.status !== 'resolved' && f.status !== 'accepted' ? (
                        <span style={{ fontSize: 10, color: 'var(--sev-medium)' }}>●</span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {(f.status === 'resolved' || f.status === 'accepted') ? (
                        <span style={{ fontSize: 10, color: 'var(--status-resolved)' }}>●</span>
                      ) : null}
                    </td>
                    <td colSpan={2}>
                      <StatusPill status={f.status} />
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
