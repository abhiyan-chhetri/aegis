'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { Avatar } from '@/components/chrome/icons';
import { Sev, StatusPill, SevCounts } from '@/components/ui/SevBadge';
import { ReportVersionHistory } from '@/components/reports/ReportVersionHistory';
import { LivePresence } from '@/components/collab/LivePresence';
import { NotesToFindingsModal } from './NotesToFindingsModal';
import { RetestScopeModal } from './RetestScopeModal';
import { BurpTab } from '@/components/burp/BurpTab';

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
  keySecurityStrengths?: string;
  keyAreasForImprovement?: string;
  immediateActions?: string;
  shortTermImprovements?: string;
  longTermRecommendations?: string;
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

const TABS = ['Overview', 'Engagements', 'Findings', 'Reports', 'Burp', 'Scope', 'Report Content', 'Notes'] as const;
type Tab = typeof TABS[number];

const SEV_ORDER = ['all', 'critical', 'high', 'medium', 'low', 'info'];

// ── Live-streaming, auto-saving markdown editor ──────────────────────────────
// Same UX as the Notes editor — every edit streams to other users in real-time
// via SSE. No "Keep mine / Keep theirs" prompts: remote updates apply live with
// caret-preservation. Edit/Preview toggle for full GFM markdown preview.
function AutoSaveField({
  label, hint, value: initial, field, projectId, rows = 6, placeholder,
}: {
  label: string; hint?: string; value: string; field: string;
  projectId: string; rows?: number; placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [typers, setTypers] = useState<Map<string, { userName: string; userColor: string }>>(new Map());

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingPingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLocalEditing = useRef(false);
  const localEditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastValue = useRef(initial);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingRemote = useRef<string | null>(null);
  const remoteApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (v: string) => {
    setStatus('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: v }),
      });
      lastBroadcastValue.current = v;
      setStatus(res.ok ? 'saved' : 'error');
      setTimeout(() => setStatus(prev => prev === 'saved' ? 'idle' : prev), 1800);
    } catch {
      setStatus('error');
    }
  }, [field, projectId]);

  // Apply remote update with caret preservation (same algorithm as LiveNotes)
  const applyRemote = useCallback((newValue: string) => {
    if (newValue === value) return;
    const el = textareaRef.current;
    if (!el) { setValue(newValue); lastBroadcastValue.current = newValue; return; }
    const oldValue = el.value;
    const oldStart = el.selectionStart;
    const oldEnd   = el.selectionEnd;

    let prefix = 0;
    const minLen = Math.min(oldValue.length, newValue.length);
    while (prefix < minLen && oldValue[prefix] === newValue[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < (minLen - prefix) &&
      oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
    ) suffix++;
    const oldChangedStart = prefix;
    const oldChangedEnd   = oldValue.length - suffix;
    const newChangedEnd   = newValue.length - suffix;
    const delta = newChangedEnd - oldChangedEnd;

    const newStart = oldStart <= oldChangedStart ? oldStart : oldStart >= oldChangedEnd ? oldStart + delta : newChangedEnd;
    const newEnd   = oldEnd   <= oldChangedStart ? oldEnd   : oldEnd   >= oldChangedEnd ? oldEnd   + delta : newChangedEnd;

    setValue(newValue);
    lastBroadcastValue.current = newValue;
    requestAnimationFrame(() => {
      try { el.setSelectionRange(newStart, newEnd); } catch { /* gone */ }
    });
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    setStatus('idle');
    isLocalEditing.current = true;
    if (localEditTimer.current) clearTimeout(localEditTimer.current);
    localEditTimer.current = setTimeout(() => { isLocalEditing.current = false; }, 1500);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(v), 400);

    // Typing pulse — throttled to 1 every 2s
    if (!typingPingTimer.current) {
      fetch(`/api/collab/project:${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      }).catch(() => {});
      typingPingTimer.current = setTimeout(() => { typingPingTimer.current = null; }, 2000);
    }
  }

  // SSE subscription — listens on the shared project channel and filters by field.
  useEffect(() => {
    const es = new EventSource(`/api/collab/project:${projectId}`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'content_update' && data.field === field) {
          if (data.value === lastBroadcastValue.current) return; // own echo
          if (!isLocalEditing.current) {
            applyRemote(data.value);
          } else {
            pendingRemote.current = data.value;
            if (remoteApplyTimer.current) clearTimeout(remoteApplyTimer.current);
            remoteApplyTimer.current = setTimeout(() => {
              if (pendingRemote.current !== null && !isLocalEditing.current) {
                applyRemote(pendingRemote.current);
              }
              pendingRemote.current = null;
            }, 250);
          }
        }
        if (data.type === 'typing' && data.field === field) {
          setTypers(prev => {
            const next = new Map(prev);
            next.set(data.userId, { userName: data.userName || 'Someone', userColor: data.userColor || '#6366f1' });
            return next;
          });
          setTimeout(() => setTypers(prev => { const n = new Map(prev); n.delete(data.userId); return n; }), 4000);
        }
        if (data.type === 'typing' && data.field === null) {
          setTypers(prev => { const n = new Map(prev); n.delete(data.userId); return n; });
        }
      } catch { /* ignore */ }
    };
    return () => {
      es.close();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (localEditTimer.current) clearTimeout(localEditTimer.current);
      if (remoteApplyTimer.current) clearTimeout(remoteApplyTimer.current);
      if (typingPingTimer.current) clearTimeout(typingPingTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, field]);

  const typerList = Array.from(typers.values());

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
        <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {label}
          {/* Live "is editing" badges */}
          {typerList.length > 0 && (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
              {typerList.map((t, i) => (
                <span key={i} style={{ color: t.userColor }}>
                  {t.userName}
                </span>
              ))}
              <span style={{ color: 'var(--ink-3)' }}>editing…</span>
              <span className="caret-pulse" style={{ display: 'inline-block', width: 6, height: 11, background: typerList[0].userColor, marginLeft: 1, verticalAlign: 'middle' }} />
            </span>
          )}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', borderRadius: 4, background: 'var(--bg-2)', padding: 2 }}>
            <button
              type="button"
              onClick={() => setMode('edit')}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer',
                background: mode === 'edit' ? 'var(--paper, white)' : 'transparent',
                color: mode === 'edit' ? 'var(--ink-1)' : 'var(--ink-3)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                boxShadow: mode === 'edit' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >EDIT</button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer',
                background: mode === 'preview' ? 'var(--paper, white)' : 'transparent',
                color: mode === 'preview' ? 'var(--ink-1)' : 'var(--ink-3)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                boxShadow: mode === 'preview' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >PREVIEW</button>
          </div>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
            color: status === 'saved' ? 'var(--status-resolved)' : status === 'error' ? 'var(--sev-critical)' : status === 'saving' ? 'var(--ink-3)' : 'transparent',
            transition: 'color 0.2s', minWidth: 56, textAlign: 'right',
          }}>
            {status === 'saving' ? 'saving…' : status === 'saved' ? '✓ saved' : status === 'error' ? 'error' : '·'}
          </span>
        </div>
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>{hint}</div>}
      {mode === 'edit' ? (
        <textarea
          ref={textareaRef}
          className="input"
          value={value}
          onChange={handleChange}
          rows={rows}
          placeholder={placeholder}
          style={{ width: '100%', lineHeight: 1.65, resize: 'vertical', fontFamily: value.includes('```') ? 'var(--font-mono)' : undefined, fontSize: 13 }}
        />
      ) : (
        <div
          className="md-preview"
          style={{
            minHeight: rows * 22, padding: '10px 14px',
            background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 4,
            fontSize: 13, lineHeight: 1.65,
          }}
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <div style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 12 }}>Nothing to preview — switch to Edit and type something.</div>
          )}
        </div>
      )}
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
  // "Rough notes → findings" batch AI modal
  const [notesModalOpen, setNotesModalOpen] = useState(false);

  // AI summary generation state
  const [aiPhase, setAiPhase] = useState<AIPhase>('idle');
  const [aiError, setAiError] = useState('');
  const [execSummaryKey, setExecSummaryKey] = useState(0);
  const [attackNarrKey, setAttackNarrKey] = useState(0);
  const [strengthsKey, setStrengthsKey] = useState(0);
  const [areasKey, setAreasKey] = useState(0);
  const [immediateKey, setImmediateKey] = useState(0);
  const [shortTermKey, setShortTermKey] = useState(0);
  const [longTermKey, setLongTermKey] = useState(0);
  const [aiStrengths, setAiStrengths] = useState<string | null>(null);
  const [aiAreas, setAiAreas] = useState<string | null>(null);
  const [aiImmediate, setAiImmediate] = useState<string | null>(null);
  const [aiShortTerm, setAiShortTerm] = useState<string | null>(null);
  const [aiLongTerm, setAiLongTerm] = useState<string | null>(null);
  const [aiExecSummary, setAiExecSummary] = useState<string | null>(null);
  const [aiAttackNarr, setAiAttackNarr] = useState<string | null>(null);

  type SummarySection = 'executiveSummary' | 'methodology' | 'attackNarrative';
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  const generateSummaryWithAI = useCallback(async (sections?: SummarySection[]) => {
    if (aiPhase !== 'idle') return;
    const want = (s: SummarySection) =>
      !sections || sections.length === 0 || sections.includes(s);
    setAiError('');
    setAiPhase('thinking');
    try {
      const riskScore = findings.length === 0 ? 0 : Math.min(10,
        ((counts.critical || 0) * 10 + (counts.high || 0) * 7 + (counts.medium || 0) * 4 + (counts.low || 0) * 1) / Math.max(1, findings.length)
      );
      const ctx = {
        projectId: project.id, // server resolves dataClassification + criticality from this
        projectName: project.name,
        engagement: project.engagement || 'Web Application',
        findings: findings.map(f => ({ title: f.title, severity: f.severity, cvss: f.cvss })),
        counts,
        riskScore,
        startDate: project.startDate,
        endDate: project.endDate,
        // Pass the existing values for sections we DON'T want to regenerate so
        // the model has them as context but won't overwrite them client-side.
        existing: {
          executiveSummary: project.executiveSummary || '',
          methodology: project.methodology || '',
          attackNarrative: project.attackNarrative || '',
        },
        // Tell the backend which sections we actually want refreshed
        sections: sections && sections.length > 0 ? sections : ['executiveSummary', 'methodology', 'attackNarrative'],
      };

      await new Promise(r => setTimeout(r, 400));
      setAiPhase('writing');

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'summary', context: ctx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI generation failed');

      const result = data.result as { executiveSummary: string; methodology: string; attackNarrative: string };

      // Apply only sections the user asked for
      const patch: Record<string, string> = {};
      if (want('executiveSummary') && result.executiveSummary) {
        setAiExecSummary(result.executiveSummary);
        patch.executiveSummary = result.executiveSummary;
      }
      if (want('methodology') && result.methodology) {
        patch.methodology = result.methodology;
      }
      if (want('attackNarrative') && result.attackNarrative) {
        setAiAttackNarr(result.attackNarrative);
        patch.attackNarrative = result.attackNarrative;
      }

      setAiPhase('done');
      await new Promise(r => setTimeout(r, 500));

      // Remount fields that were regenerated so they pick up the new initialValue
      if (patch.executiveSummary) setExecSummaryKey(k => k + 1);
      if (patch.attackNarrative)  setAttackNarrKey(k => k + 1);

      // Persist
      if (Object.keys(patch).length > 0) {
        await fetch(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }
    } catch (e) { setAiError(e instanceof Error ? e.message : 'AI generation failed'); }
    finally { setAiPhase('idle'); }
  }, [aiPhase, project, findings, counts, riskScore]);

  // Generate a single section with full report context sent to AI
  const generateSectionAI = useCallback(async (field: string) => {
    if (aiPhase !== 'idle') return;
    setAiPhase('thinking');
    setAiError('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'report-section',
          context: {
            section: field,
            projectName: project.name,
            engagement: project.engagement,
            findings: findings.map((f: any) => ({
              title: f.title, severity: f.severity, cvss: f.cvss,
              description: f.description, impact: f.impact, remediation: f.remediation,
            })),
            counts,
            riskScore: findings.length === 0 ? 0 : ((counts.critical||0)*10 + (counts.high||0)*7 + (counts.medium||0)*4 + (counts.low||0)*1) / Math.max(1, findings.length),
            startDate: project.startDate, endDate: project.endDate,
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'AI generation failed');
      const data = await res.json();
      const result = data.result?.content || data.result?.[field] || '';
      if (result) {
        // Save to backend
        await fetch(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: result }),
        });
        // Update local state so editor shows content immediately
        if (field === 'keySecurityStrengths') { setAiStrengths(result); setStrengthsKey(k => k + 1); }
        else if (field === 'keyAreasForImprovement') { setAiAreas(result); setAreasKey(k => k + 1); }
        else if (field === 'immediateActions') { setAiImmediate(result); setImmediateKey(k => k + 1); }
        else if (field === 'shortTermImprovements') { setAiShortTerm(result); setShortTermKey(k => k + 1); }
        else if (field === 'longTermRecommendations') { setAiLongTerm(result); setLongTermKey(k => k + 1); }
        toast.success('Content generated');
      }
    } catch (e) { setAiError(e instanceof Error ? e.message : 'AI generation failed'); }
    finally { setAiPhase('idle'); }
  }, [aiPhase, project, findings, counts, riskScore]);

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

  // Client-side ordered copy of findings so drag-and-drop can reorder instantly.
  // Initialised from the server-provided order; resyncs only when the set of
  // ids actually changes (new finding added / one deleted), not on every props
  // update — so the user's drag order isn't blown away by a re-render.
  const [orderedFindings, setOrderedFindings] = useState(findings);
  const lastIdSig = useRef(findings.map(f => f.id).join('|'));
  useEffect(() => {
    const sig = findings.map(f => f.id).join('|');
    if (sig !== lastIdSig.current) {
      setOrderedFindings(findings);
      lastIdSig.current = sig;
    }
  }, [findings]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Save status for the drag-reorder feature so the user gets visible
  // feedback when the order is persisted (or when persistence fails).
  const [reorderSaveStatus, setReorderSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const reorderActive = sevFilter === 'all' && !search;

  function handleDragStart(e: React.DragEvent, id: string) {
    if (!reorderActive) { e.preventDefault(); return; }
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
  }
  function handleDragOver(e: React.DragEvent, id: string) {
    if (!reorderActive || !dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  }
  function handleDragLeave() { setDragOverId(null); }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const from = orderedFindings.findIndex(f => f.id === dragId);
    const to   = orderedFindings.findIndex(f => f.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    const next = [...orderedFindings];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrderedFindings(next);
    setDragId(null);

    // Persist + surface success/failure clearly. The new server route is
    // self-healing (it adds the sortOrder column if missing) and transactional.
    setReorderSaveStatus('saving');
    fetch(`/api/projects/${project.id}/findings/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map(f => f.id) }),
    })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('[reorder] failed:', res.status, body);
          setReorderSaveStatus('error');
          toast.error('Couldn\'t save order', { description: body?.error || `HTTP ${res.status}` });
          return;
        }
        setReorderSaveStatus('saved');
        setTimeout(() => setReorderSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 1800);
        toast.success('Finding order saved');
      })
      .catch(err => {
        console.error('[reorder] network error:', err);
        setReorderSaveStatus('error');
        toast.error('Couldn\'t save order', { description: 'Network error' });
      });
  }
  function handleDragEnd() { setDragId(null); setDragOverId(null); }

  const filtered = useMemo(() => {
    return orderedFindings.filter(f => {
      const matchSev = sevFilter === 'all' || f.severity === sevFilter;
      const matchSearch = !search ||
        f.title.toLowerCase().includes(search.toLowerCase()) ||
        f.code.toLowerCase().includes(search.toLowerCase());
      return matchSev && matchSearch;
    });
  }, [orderedFindings, sevFilter, search]);

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

        {/* ── ENGAGEMENTS TAB (timeline, carry-over, retest scope) ── */}
        {activeTab === 'Engagements' && (
          <EngagementsTab
            project={project}
            engagementSiblings={engagementSiblings}
            carryoverFindings={carryoverFindings}
          />
        )}

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
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setNotesModalOpen(true)}
                title="Paste your rough engagement notes and let AI propose the findings"
                style={{ gap: 5, fontSize: 11.5 }}
              >
                <Ico name="sparkles" size={12} style={{ color: '#9b7fd4' }} />
                Notes → findings
              </button>
              <LivePresence entity={`project:${project.id}`} />
              <div style={{ position: 'relative' }}>
                <Ico name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
                <input className="input" placeholder="Search findings…" value={search}
                  onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, width: 220 }} />
              </div>
            </div>

            {/* Drag hint — only shown when reorder is active, includes save state */}
            {reorderActive && findings.length > 1 && (
              <div style={{ fontSize: 11, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ico name="grip" size={12} />
                Drag rows by the handle to reorder findings — order persists across the report and team.
                {reorderSaveStatus !== 'idle' && (
                  <span style={{
                    marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5,
                    color: reorderSaveStatus === 'saved'  ? 'var(--status-resolved)'
                         : reorderSaveStatus === 'saving' ? 'var(--ink-3)'
                         : 'var(--sev-critical)',
                  }}>
                    {reorderSaveStatus === 'saving' ? 'saving order…'
                      : reorderSaveStatus === 'saved'  ? '✓ order saved'
                      : '✗ couldn\'t save — check console / restart server'}
                  </span>
                )}
              </div>
            )}

            {/* Table */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
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
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--ink-3)' }}>No findings match the current filter</td></tr>
                  ) : filtered.map(f => (
                    <tr
                      key={f.id}
                      draggable={reorderActive}
                      onDragStart={e => handleDragStart(e, f.id)}
                      onDragOver={e => handleDragOver(e, f.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, f.id)}
                      onDragEnd={handleDragEnd}
                      style={{
                        opacity: dragId === f.id ? 0.4 : 1,
                        borderTop: dragOverId === f.id ? '2px solid var(--accent)' : undefined,
                        transition: 'opacity 0.12s, border-color 0.12s',
                        cursor: reorderActive ? 'grab' : undefined,
                      }}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
                        {reorderActive ? (
                          <span title="Drag to reorder" style={{ cursor: 'grab', display: 'inline-flex' }}>
                            <Ico name="grip" size={13} />
                          </span>
                        ) : null}
                      </td>
                      <td><span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{f.code}</span></td>
                      <td>
                        <Link
                          href={`/projects/${project.id}/findings/${f.id}`}
                          draggable={false}
                          style={{ color: 'var(--ink-0)', textDecoration: 'none', fontWeight: 500 }}
                        >{f.title}</Link>
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
                    ['Type', (project as { engagementType?: string }).engagementType === 'internal' ? 'Internal (assumed-breach)' : 'External (perimeter)'],
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

        {/* ── BURP BRIDGE TAB ── */}
        {activeTab === 'Burp' && (
          <BurpTab projectId={project.id} projectName={project.name} />
        )}

        {/* ── SCOPE TAB ── */}
        {activeTab === 'Scope' && (
          <div style={{ maxWidth: 780 }}>
            <ScopeManager initial={scopeRows} projectId={project.id} />
          </div>
        )}

        {/* ── REPORT CONTENT TAB ── */}
        {activeTab === 'Report Content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Header row: info banner + AI split-button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--accent)' }}>
                <Ico name="info" size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  All fields below appear in the generated PDF report. Changes are auto-saved as you type. Markdown is supported.
                </span>
              </div>
              {/* AI split-button: main click = whole report, chevron = pick section */}
              <div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => generateSummaryWithAI()}
                  disabled={aiPhase !== 'idle'}
                  title="Regenerate the entire narrative (Executive Summary, Methodology, Attack Narrative)"
                  style={{ whiteSpace: 'nowrap', gap: 6, borderRadius: 'var(--r-xs) 0 0 var(--r-xs)' }}
                >
                  <span className={aiPhase !== 'idle' ? 'anim-sparkle' : ''} style={{ fontSize: 13 }}>✨</span>
                  {aiPhase !== 'idle' ? 'Generating…' : 'Generate with AI'}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setAiMenuOpen(v => !v)}
                  disabled={aiPhase !== 'idle'}
                  title="Generate only one section"
                  style={{ padding: '0 8px', borderRadius: '0 var(--r-xs) var(--r-xs) 0', borderLeft: 'none', display: 'flex', alignItems: 'center' }}
                >
                  <Ico name="chevDown" size={12} />
                </button>
                {aiMenuOpen && (
                  <>
                    <div onClick={() => setAiMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 6,
                      background: 'var(--bg-2)', border: '1px solid var(--line-2)',
                      borderRadius: 'var(--r-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      minWidth: 240, zIndex: 20, padding: 6,
                    }}>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', padding: '6px 10px', letterSpacing: '0.06em' }}>
                        GENERATE SELECTED SECTION
                      </div>
                      {([
                        ['executiveSummary' as SummarySection, 'Executive Summary'],
                        ['methodology'      as SummarySection, 'Methodology'],
                        ['attackNarrative'  as SummarySection, 'Attack Narrative'],
                      ] as const).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => { setAiMenuOpen(false); generateSummaryWithAI([key]); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', padding: '7px 10px', fontSize: 12,
                            background: 'transparent', border: 'none', borderRadius: 'var(--r-xs)',
                            cursor: 'pointer', color: 'var(--ink-1)', textAlign: 'left',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 13 }}>✨</span>
                          {label}
                        </button>
                      ))}
                      <div style={{ height: 1, background: 'var(--line-1)', margin: '4px 0' }} />
                      <button
                        onClick={() => { setAiMenuOpen(false); generateSummaryWithAI(); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '7px 10px', fontSize: 12,
                          background: 'transparent', border: 'none', borderRadius: 'var(--r-xs)',
                          cursor: 'pointer', color: 'var(--ink-1)', textAlign: 'left', fontWeight: 600,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize: 13 }}>✨</span>
                        All sections
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* AI error banner */}
            {aiError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,92,58,0.08)', border: '1px solid rgba(255,92,58,0.25)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--sev-critical)' }}>
                <strong>AI error:</strong> {aiError}
              </div>
            )}

            {/* Executive Summary — big editor box, same writing experience as Notes */}
            <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>Executive Summary</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>High-level overview for stakeholders. Markdown · Live co-editing · Auto-saved.</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => generateSummaryWithAI(['executiveSummary'])}
                  disabled={aiPhase !== 'idle'}
                  style={{ fontSize: 11, gap: 4 }}
                  title="Regenerate just this section"
                >
                  <span>✨</span>
                  AI
                </button>
              </div>
              <div style={{ height: 'calc(100vh - 280px)', minHeight: 520, display: 'flex', flexDirection: 'column' }}>
                <ProjectNotesEditor
                  key={`exec-${execSummaryKey}`}
                  projectId={project.id}
                  field="executiveSummary"
                  label="Executive Summary"
                  description="Markdown · Live co-editing · Auto-saved"
                  initialNotes={aiExecSummary !== null && execSummaryKey > 0 ? aiExecSummary : (project.executiveSummary || '')}
                  placeholder={`# Executive Summary\n\nOver X weeks, a grey-box penetration test was conducted against…\n\nThe assessment identified N critical, N high, and N medium severity findings…`}
                />
              </div>
            </div>

            {/* Key Security Strengths */}
            <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}><div className="eyebrow" style={{ marginBottom: 4 }}>Key Security Strengths</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>What the organisation is doing well. Markdown · Auto-saved.</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => generateSectionAI('keySecurityStrengths')} disabled={aiPhase !== 'idle'} style={{ fontSize: 11, gap: 4 }}><span>✨</span> AI</button>
              </div>
              <div style={{ height: 300, display: 'flex', flexDirection: 'column' }}>
                <ProjectNotesEditor key={`strengths-${strengthsKey}`} projectId={project.id} field="keySecurityStrengths" label="Key Security Strengths" description="Markdown · Auto-saved" initialNotes={aiStrengths !== null && strengthsKey > 0 ? aiStrengths : (project.keySecurityStrengths || '')} placeholder="- MFA enforced on critical systems\n- Regular security awareness training\n- Proper network segmentation" />
              </div>
            </div>

            {/* Key Areas for Improvement */}
            <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}><div className="eyebrow" style={{ marginBottom: 4 }}>Key Areas for Improvement</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Critical areas needing attention based on findings. Markdown · Auto-saved.</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => generateSectionAI('keyAreasForImprovement')} disabled={aiPhase !== 'idle'} style={{ fontSize: 11, gap: 4 }}><span>✨</span> AI</button>
              </div>
              <div style={{ height: 300, display: 'flex', flexDirection: 'column' }}>
                <ProjectNotesEditor key={`areas-${areasKey}`} projectId={project.id} field="keyAreasForImprovement" label="Key Areas for Improvement" description="Markdown · Auto-saved" initialNotes={aiAreas !== null && areasKey > 0 ? aiAreas : (project.keyAreasForImprovement || '')} placeholder="- Several high-severity findings need immediate remediation\n- Patch management process needs improvement" />
              </div>
            </div>

            {/* Immediate Actions */}
            <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}><div className="eyebrow" style={{ marginBottom: 4 }}>Immediate Actions (0–30 Days)</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Critical fixes that must be addressed within the first month. Markdown · Auto-saved.</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => generateSectionAI('immediateActions')} disabled={aiPhase !== 'idle'} style={{ fontSize: 11, gap: 4 }}><span>✨</span> AI</button>
              </div>
              <div style={{ height: 280, display: 'flex', flexDirection: 'column' }}>
                <ProjectNotesEditor key={`immediate-${immediateKey}`} projectId={project.id} field="immediateActions" label="Immediate Actions" description="Markdown · Auto-saved" initialNotes={aiImmediate !== null && immediateKey > 0 ? aiImmediate : (project.immediateActions || '')} placeholder="- Patch the SQL injection vulnerability on /api/login (Critical, CVSS 9.8)\n- Rotate all credentials exposed during the assessment\n- Apply missing security patches on internet-facing servers\n- ..." />
              </div>
            </div>

            {/* Short-Term Improvements */}
            <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}><div className="eyebrow" style={{ marginBottom: 4 }}>Short-Term Improvements (30–90 Days)</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Security enhancements to implement within the quarter. Markdown · Auto-saved.</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => generateSectionAI('shortTermImprovements')} disabled={aiPhase !== 'idle'} style={{ fontSize: 11, gap: 4 }}><span>✨</span> AI</button>
              </div>
              <div style={{ height: 280, display: 'flex', flexDirection: 'column' }}>
                <ProjectNotesEditor key={`shortterm-${shortTermKey}`} projectId={project.id} field="shortTermImprovements" label="Short-Term Improvements" description="Markdown · Auto-saved" initialNotes={aiShortTerm !== null && shortTermKey > 0 ? aiShortTerm : (project.shortTermImprovements || '')} placeholder="- Deploy WAF rules to protect against the injection vulnerabilities discovered\n- Implement network segmentation between user VLAN and server VLAN\n- Roll out MFA for all privileged accounts\n- ..." />
              </div>
            </div>

            {/* Long-Term Recommendations */}
            <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}><div className="eyebrow" style={{ marginBottom: 4 }}>Long-Term Strategic Recommendations</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Strategic roadmap for lasting security posture improvement. Markdown · Auto-saved.</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => generateSectionAI('longTermRecommendations')} disabled={aiPhase !== 'idle'} style={{ fontSize: 11, gap: 4 }}><span>✨</span> AI</button>
              </div>
              <div style={{ height: 280, display: 'flex', flexDirection: 'column' }}>
                <ProjectNotesEditor key={`longterm-${longTermKey}`} projectId={project.id} field="longTermRecommendations" label="Long-Term Recommendations" description="Markdown · Auto-saved" initialNotes={aiLongTerm !== null && longTermKey > 0 ? aiLongTerm : (project.longTermRecommendations || '')} placeholder="- Implement a zero-trust architecture with micro-segmentation\n- Establish a continuous security testing program with quarterly penetration tests\n- Build an internal red team capability for adversary simulation\n- ..." />
              </div>
            </div>

            <div className="card" style={{ padding: 'var(--card-pad)' }}>
              <div className="eyebrow" style={{ marginBottom: 16 }}>Team Assignment</div>
              <MembersManager initial={initialMembers} allUsers={allUsers} projectId={project.id} />
            </div>
          </div>
        )}

        {/* Notes tab is rendered outside this container (full-screen) */}


      {/* ── Rough notes → findings batch AI modal ── */}
      {notesModalOpen && (
        <NotesToFindingsModal
          project={{
            id: project.id,
            name: project.name,
            engagement: project.engagement,
            notes: project.notes || '',
            scope: (project as { scope?: string }).scope || '',
            targetCode: project.targetCode,
            engagementYear: project.engagementYear,
          }}
          existingTitles={findings.map(f => f.title)}
          onClose={() => setNotesModalOpen(false)}
          onGoToNotes={() => setActiveTab('Notes')}
          onCreated={() => {
            setNotesModalOpen(false);
            // Re-fetch the server component so the new findings appear.
            router.refresh();
          }}
        />
      )}
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

// ── Full-screen markdown editor with live co-editing ─────────────────────────
// Generic: works for Engagement Notes (field='notes', channel='notes:PID'),
// Executive Summary, Methodology, and Attack Narrative
// (field=<name>, channel='project:PID'). All variants share the same toolbar,
// image upload, write/preview tabs, live SSE sync, and typing badges.
function ProjectNotesEditor({
  projectId,
  initialNotes,
  field = 'notes',
  label = 'Engagement Notes',
  description = 'Markdown · Live-streaming · Auto-saved',
  placeholder,
  fullHeight = true,
}: {
  projectId: string;
  initialNotes: string;
  field?: string;
  label?: string;
  description?: string;
  placeholder?: string;
  fullHeight?: boolean;
}) {
  const channel = field === 'notes' ? `notes:${projectId}` : `project:${projectId}`;
  const [notes, setNotes] = React.useState(initialNotes);
  const [editorTab, setEditorTab] = React.useState<'Write' | 'Preview'>('Write');
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dragOver, setDragOver] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [typers, setTypers] = React.useState<Map<string, { userName: string; userColor: string; line?: number }>>(new Map());
  const myUserId = React.useRef<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingThrottle = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = React.useRef(initialNotes);
  const isLocalEditing = React.useRef(false);
  const localEditTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRemote = React.useRef<string | null>(null);
  const remoteApplyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
    saveTimer.current = setTimeout(() => persist(val), 400);
  }

  async function persist(val: string) {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val }),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
      if (res.ok) lastSaved.current = val;
      setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 1800);
    } catch { setSaveStatus('error'); }
  }

  // Caret-preserving remote-update applier
  function applyRemote(newValue: string) {
    if (newValue === notes) return;
    const el = textareaRef.current;
    if (!el) { setNotes(newValue); lastSaved.current = newValue; return; }
    const oldValue = el.value;
    const oldStart = el.selectionStart;
    const oldEnd   = el.selectionEnd;
    let prefix = 0;
    const minLen = Math.min(oldValue.length, newValue.length);
    while (prefix < minLen && oldValue[prefix] === newValue[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < (minLen - prefix) &&
      oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
    ) suffix++;
    const oldChangedStart = prefix;
    const oldChangedEnd   = oldValue.length - suffix;
    const newChangedEnd   = newValue.length - suffix;
    const delta = newChangedEnd - oldChangedEnd;
    const newStart = oldStart <= oldChangedStart ? oldStart : oldStart >= oldChangedEnd ? oldStart + delta : newChangedEnd;
    const newEnd   = oldEnd   <= oldChangedStart ? oldEnd   : oldEnd   >= oldChangedEnd ? oldEnd   + delta : newChangedEnd;
    setNotes(newValue);
    lastSaved.current = newValue;
    requestAnimationFrame(() => { try { el.setSelectionRange(newStart, newEnd); } catch { /* gone */ } });
  }

  function handleChange(val: string) {
    setNotes(val);
    isLocalEditing.current = true;
    if (localEditTimer.current) clearTimeout(localEditTimer.current);
    localEditTimer.current = setTimeout(() => { isLocalEditing.current = false; }, 1500);
    schedSave(val);
    // Throttle typing broadcasts to every 2s — include caret line so other
    // users can see roughly where each person is editing.
    if (!typingThrottle.current) {
      const ta = textareaRef.current;
      const line = ta ? (val.slice(0, ta.selectionStart).match(/\n/g)?.length ?? 0) + 1 : undefined;
      fetch(`/api/collab/${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, line }),
      }).catch(() => {});
      typingThrottle.current = setTimeout(() => { typingThrottle.current = null; }, 1200);
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

  // SSE real-time streaming sync — no conflict prompts, edits flow live.
  React.useEffect(() => {
    const es = new EventSource(`/api/collab/${channel}`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Capture our own user id so we can filter our own typing events out
        if (data.type === 'connected' && data.userId) {
          myUserId.current = data.userId;
        }
        if ((data.type === 'content_update' && data.field === field) || (data.type === 'notes_update' && field === 'notes')) {
          const incoming = data.value ?? data.notes;
          if (typeof incoming !== 'string') return;
          if (incoming === lastSaved.current) return; // own echo
          if (!isLocalEditing.current) {
            applyRemote(incoming);
          } else {
            pendingRemote.current = incoming;
            if (remoteApplyTimer.current) clearTimeout(remoteApplyTimer.current);
            remoteApplyTimer.current = setTimeout(() => {
              if (pendingRemote.current !== null && !isLocalEditing.current) {
                applyRemote(pendingRemote.current);
              }
              pendingRemote.current = null;
            }, 250);
          }
        }
        if (data.type === 'typing' && data.field === field) {
          // Ignore our OWN echo — we never want to show "you are typing" to yourself
          if (data.userId === myUserId.current) return;
          setTypers(prev => {
            const next = new Map(prev);
            next.set(data.userId, { userName: data.userName || 'Someone', userColor: data.userColor || '#6366f1', line: data.line });
            return next;
          });
          setTimeout(() => setTypers(prev => { const n = new Map(prev); n.delete(data.userId); return n; }), 4000);
        }
        if (data.type === 'typing' && data.field === null) {
          setTypers(prev => { const n = new Map(prev); n.delete(data.userId); return n; });
        }
      } catch { /* ignore */ }
    };
    return () => {
      es.close();
      if (localEditTimer.current) clearTimeout(localEditTimer.current);
      if (remoteApplyTimer.current) clearTimeout(remoteApplyTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, channel, field]);

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

  // Fullscreen overlay support — when toggled, the editor renders fixed over
  // the entire viewport with Esc to exit.
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return (
    <div style={fullscreen
      ? { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }
      : { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    }>
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
        {typers.size > 0 && (
          <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {Array.from(typers.values()).map((t, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 6px', borderRadius: 'var(--r-xs)',
                background: `${t.userColor}1a`, border: `1px solid ${t.userColor}55`,
                color: t.userColor, fontWeight: 600,
              }}>
                <span className="caret-pulse" style={{ display: 'inline-block', width: 3, height: 10, background: t.userColor }} />
                {t.userName}
                {t.line && <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· L{t.line}</span>}
              </span>
            ))}
          </span>
        )}
        <LivePresence entity={`project-notes:${projectId}`} />
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: saveStatus === 'saved' ? 'var(--status-resolved)' : saveStatus === 'saving' ? 'var(--ink-3)' : saveStatus === 'error' ? 'var(--sev-critical)' : 'var(--ink-4)' }}>
          {saveStatus === 'saving' ? 'saving…' : saveStatus === 'saved' ? '✓ saved' : saveStatus === 'error' ? 'error' : `${notes.length} chars`}
        </div>
        {/* Fullscreen toggle */}
        <button
          onClick={() => setFullscreen(f => !f)}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Open in fullscreen'}
          style={{
            width: 26, height: 26, borderRadius: 'var(--r-xs)', border: 'none',
            background: fullscreen ? 'var(--bg-2)' : 'transparent', color: 'var(--ink-2)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
          }}
        >
          <Ico name={fullscreen ? 'minimize' : 'maximize'} size={13} />
        </button>
      </div>

      {/* Editor / Preview area */}
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative', background: 'var(--bg-0)' }}
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
          <>
            {/* Remote-cursor overlay — coloured line indicators showing where
                each remote user's caret is (Google-Docs-style multi-cursor). */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
              {Array.from(typers.values()).filter(t => t.line && t.line > 0).map((t, i) => {
                // padding-top:20 + lineHeight (13.5*1.75 ≈ 23.6) * (line-1)
                const top = 20 + 23.6 * ((t.line || 1) - 1);
                return (
                  <div key={i} style={{
                    position: 'absolute', left: 0, right: 0,
                    top, height: 23.6,
                    borderLeft: `3px solid ${t.userColor}`,
                    background: `linear-gradient(to right, ${t.userColor}14 0%, transparent 30%)`,
                  }}>
                    <span style={{
                      position: 'absolute', left: 4, top: -1,
                      fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: '#fff', background: t.userColor,
                      padding: '1px 5px', borderRadius: '0 3px 3px 0',
                      letterSpacing: '0.04em',
                    }}>{t.userName}</span>
                  </div>
                );
              })}
            </div>
            <textarea
              ref={textareaRef}
              className="thin-scroll"
              value={notes}
              onChange={e => handleChange(e.target.value)}
              onPaste={handlePaste}
              onSelect={e => {
                // Broadcast caret position when user clicks / arrows (not just types).
                // Throttled — piggybacks on typingThrottle so we don't spam the server.
                if (typingThrottle.current) return;
                const ta = e.currentTarget;
                const line = (notes.slice(0, ta.selectionStart).match(/\n/g)?.length ?? 0) + 1;
                fetch(`/api/collab/${channel}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ field, line }),
                }).catch(() => {});
                typingThrottle.current = setTimeout(() => { typingThrottle.current = null; }, 1200);
              }}
              placeholder={placeholder ?? `# ${label}\n\nStart writing here. Markdown is supported.`}
              style={{
                display: 'block', width: '100%', height: '100%',
                padding: '20px 28px', background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', fontSize: 13.5,
                lineHeight: 1.75, resize: 'none', boxSizing: 'border-box',
                position: 'relative', zIndex: 1,
              }}
            />
          </>
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
  const [retestOpen, setRetestOpen] = useState(false);
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
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRetestOpen(true)}
              title="Generate an AI retest checklist from the unresolved findings"
              style={{ gap: 5, fontSize: 11 }}
            >
              <Ico name="sparkles" size={12} style={{ color: '#9b7fd4' }} />
              AI retest scope
            </button>
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

      {/* AI retest scope modal */}
      {retestOpen && (
        <RetestScopeModal
          projectId={project.id}
          projectName={project.name}
          engagement={project.engagement}
          previousEngagement={prevSibling ? `${prevSibling.code} (${prevSibling.engagementYear || prevSibling.startDate})` : 'previous engagement'}
          findingIds={carryoverFindings.map(f => f.id)}
          onClose={() => setRetestOpen(false)}
        />
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
