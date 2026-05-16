'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Ico } from './icons';

// ─────────────────────────────────────────────────────────────────────────────
//  Command Palette (⌘K)
//  - Static navigation commands (always available)
//  - Live API search across projects + findings + reports
//  - "Recent" list backed by localStorage (last 6 things you opened)
// ─────────────────────────────────────────────────────────────────────────────

type CmdType = 'nav' | 'action' | 'project' | 'finding' | 'report';

interface Cmd {
  id: string;
  type: CmdType;
  label: string;
  sub?: string;
  icon: string;
  href?: string;
  action?: () => void;
  severity?: string;
  group: 'Navigate' | 'Actions' | 'Projects' | 'Findings' | 'Reports' | 'Recent';
}

const STATIC_CMDS: Cmd[] = [
  { id: 'nav-dashboard',  type: 'nav', label: 'Dashboard',              sub: 'Overview',              icon: 'dashboard', href: '/dashboard',   group: 'Navigate' },
  { id: 'nav-portfolio',  type: 'nav', label: 'Portfolio',              sub: 'MBR + KPIs',            icon: 'chart',     href: '/portfolio',   group: 'Navigate' },
  { id: 'nav-projects',   type: 'nav', label: 'Projects',               sub: 'All engagements',       icon: 'projects',  href: '/projects',    group: 'Navigate' },
  { id: 'nav-library',    type: 'nav', label: 'Vulnerability Library',  sub: 'All findings, every project', icon: 'library', href: '/library', group: 'Navigate' },
  { id: 'nav-reports',    type: 'nav', label: 'Reports',                sub: 'Generated deliverables', icon: 'reports',   href: '/reports',   group: 'Navigate' },
  { id: 'nav-templates',  type: 'nav', label: 'Templates',              sub: 'Report templates',       icon: 'templates', href: '/templates', group: 'Navigate' },
  { id: 'nav-team',       type: 'nav', label: 'Team',                   sub: 'Members & workload',     icon: 'team',      href: '/team',      group: 'Navigate' },
  { id: 'nav-audit',      type: 'nav', label: 'Audit Trail',            sub: 'Who did what',           icon: 'history',   href: '/audit-trail', group: 'Navigate' },
  { id: 'nav-changelog',  type: 'nav', label: 'Changelog',              sub: 'Release notes',          icon: 'note',      href: '/changelog', group: 'Navigate' },
  { id: 'nav-settings',   type: 'nav', label: 'Settings',               sub: 'Workspace configuration', icon: 'settings', href: '/settings',  group: 'Navigate' },
  { id: 'act-new-project',type: 'action', label: 'New project',         sub: 'Start a new engagement', icon: 'plus',     href: '/projects/new', group: 'Actions' },
  { id: 'act-theme',      type: 'action', label: 'Toggle theme (light / dark)', sub: 'Press T anywhere', icon: 'moon',   action: () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aegis:theme-toggle'));
  }, group: 'Actions' },
  { id: 'act-shortcuts',  type: 'action', label: 'Show keyboard shortcuts', sub: 'Press ? anywhere',   icon: 'info',     action: () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aegis:shortcuts-open'));
  }, group: 'Actions' },
];

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)',
  medium:   'var(--sev-medium)',   low:  'var(--sev-low)',
  info:     'var(--sev-info, #5B9BD5)',
};

// ── LocalStorage-backed "recent" list ────────────────────────────────────────
const RECENT_KEY = 'aegis.cmd.recent';
const RECENT_MAX = 6;

function loadRecents(): Cmd[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Cmd[]).slice(0, RECENT_MAX);
  } catch { return []; }
}

export function pushRecent(cmd: Cmd) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadRecents().filter(c => c.id !== cmd.id);
    current.unshift({ ...cmd, group: 'Recent' });
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, RECENT_MAX)));
    // Also broadcast so the Dashboard "Resume editing" widget can refresh.
    window.dispatchEvent(new CustomEvent('aegis:recent-updated'));
  } catch { /* ignore quota / SSR */ }
}

// ── Button (in topbar) ───────────────────────────────────────────────────────
export function CommandPaletteButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(v => !v); }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: 34, padding: '0 12px', width: 280,
        background: 'var(--bg-1)', border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-sm)', color: 'var(--ink-2)',
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
      }}>
        <Ico name="search" size={14} />
        <span style={{ fontSize: 12.5 }}>Search projects, findings…</span>
        <kbd style={{
          marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)',
          padding: '2px 6px', background: 'var(--bg-2)', borderRadius: 3,
          border: '1px solid var(--line-1)', color: 'var(--ink-2)',
        }}>⌘K</kbd>
      </button>
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [remote, setRemote] = useState<Cmd[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<Cmd[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => { inputRef.current?.focus(); setRecents(loadRecents()); }, []);

  // Debounced API search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setRemote([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const groupMap: Record<string, Cmd['group']> = { project: 'Projects', finding: 'Findings', report: 'Reports' };
        const iconMap:  Record<string, string>       = { project: 'projects', finding: 'alert',    report: 'reports' };
        const items: Cmd[] = (data.results || []).map((r: {
          id: string; type: string; label: string; sub?: string; href: string; severity?: string;
        }) => ({
          id: `${r.type}-${r.id}`,
          type: r.type as CmdType,
          label: r.label,
          sub: r.sub,
          icon: iconMap[r.type] || 'circle',
          href: r.href,
          severity: r.severity,
          group: groupMap[r.type] || 'Projects',
        }));
        setRemote(items);
      } catch { /* ignore */ }
      setLoading(false);
    }, 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  // Filter static commands locally
  const staticFiltered = STATIC_CMDS.filter(c => {
    if (!q.trim()) return true;
    const hay = (c.label + ' ' + (c.sub || '')).toLowerCase();
    return q.toLowerCase().split(/\s+/).every(t => hay.includes(t));
  });

  // Final ordered list: when no query → recents + static. When query → remote + static-filtered.
  const items: Cmd[] = q.trim()
    ? [...remote, ...staticFiltered]
    : [...recents, ...staticFiltered];

  useEffect(() => { setIdx(0); }, [q, remote.length]);

  const go = useCallback((cmd: Cmd) => {
    pushRecent(cmd);
    if (cmd.action) cmd.action();
    if (cmd.href) router.push(cmd.href);
    onClose();
  }, [router, onClose]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && items[idx]) go(items[idx]);
    if (e.key === 'Escape') onClose();
  }

  // Build grouped list while preserving the overall index for keyboard nav
  const grouped: { group: Cmd['group']; rows: { cmd: Cmd; flatIdx: number }[] }[] = [];
  items.forEach((cmd, flatIdx) => {
    const last = grouped[grouped.length - 1];
    if (last && last.group === cmd.group) last.rows.push({ cmd, flatIdx });
    else grouped.push({ group: cmd.group, rows: [{ cmd, flatIdx }] });
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.12s ease' }}
      onClick={onClose}
    >
      <div
        style={{ width: 620, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--line-1)' }}>
          <Ico name="search" size={16} style={{ color: 'var(--ink-2)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search projects, findings, reports, actions…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 15, color: 'var(--ink-0)', fontFamily: 'var(--font-sans)' }}
          />
          {loading && (
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }} className="anim-pulse">searching…</span>
          )}
          <kbd style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', background: 'var(--bg-2)', borderRadius: 3, border: '1px solid var(--line-1)', color: 'var(--ink-2)' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 440, overflowY: 'auto' }} className="thin-scroll">
          {items.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              No results for &ldquo;{q}&rdquo;
            </div>
          )}
          {grouped.map(group => (
            <div key={group.group}>
              <div style={{ padding: '8px 18px 4px', fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                {group.group}
              </div>
              {group.rows.map(({ cmd, flatIdx }) => (
                <div key={cmd.id}
                     onClick={() => go(cmd)}
                     style={{
                       display: 'flex', alignItems: 'center', gap: 12,
                       padding: '10px 18px', cursor: 'pointer',
                       background: flatIdx === idx ? 'var(--bg-3)' : 'transparent',
                       transition: 'background 0.08s',
                       borderLeft: flatIdx === idx ? '2px solid var(--accent)' : '2px solid transparent',
                     }}
                     onMouseEnter={() => setIdx(flatIdx)}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: cmd.severity ? `color-mix(in srgb, ${SEV_COLOR[cmd.severity]} 16%, transparent)` : 'var(--bg-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    color: cmd.severity ? SEV_COLOR[cmd.severity] : 'var(--ink-2)',
                  }}>
                    <Ico name={cmd.icon} size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: 'var(--ink-0)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd.label}</div>
                    {cmd.sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd.sub}</div>}
                  </div>
                  {cmd.severity && (
                    <span style={{
                      fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      padding: '1px 6px', borderRadius: 3,
                      background: `color-mix(in srgb, ${SEV_COLOR[cmd.severity]} 16%, transparent)`,
                      color: SEV_COLOR[cmd.severity],
                    }}>{cmd.severity}</span>
                  )}
                  <Ico name="chevRight" size={13} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line-1)', display: 'flex', gap: 14, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> navigate</span>
          <span><kbd style={kbdStyle}>↵</kbd> open</span>
          <span><kbd style={kbdStyle}>Esc</kbd> close</span>
          <span style={{ marginLeft: 'auto' }}>Aegis Command · ⌘K</span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px', background: 'var(--bg-2)', borderRadius: 3,
  border: '1px solid var(--line-1)', color: 'var(--ink-2)', marginRight: 3,
};
