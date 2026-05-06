'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Ico } from './icons';

type Cmd = {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  href?: string;
  action?: () => void;
};

const STATIC_CMDS: Cmd[] = [
  { id: 'dashboard', label: 'Dashboard', sub: 'Overview', icon: 'dashboard', href: '/dashboard' },
  { id: 'projects',  label: 'Projects',  sub: 'All engagements', icon: 'projects', href: '/projects' },
  { id: 'library',   label: 'Vulnerability Library', sub: 'Reusable templates', icon: 'library', href: '/library' },
  { id: 'reports',   label: 'Reports',   sub: 'Generated deliverables', icon: 'reports', href: '/reports' },
  { id: 'templates', label: 'Templates', sub: 'Report templates & LaTeX', icon: 'templates', href: '/templates' },
  { id: 'team',      label: 'Team',      sub: 'Members & workload', icon: 'team', href: '/team' },
  { id: 'settings',  label: 'Settings',  sub: 'Workspace configuration', icon: 'settings', href: '/settings' },
  { id: 'new-project', label: 'New project', sub: 'Start a new engagement', icon: 'plus', href: '/projects/new' },
];

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

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = STATIC_CMDS.filter(c =>
    !q || (c.label + (c.sub || '')).toLowerCase().includes(q.toLowerCase())
  );

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setIdx(0); }, [q]);

  function go(cmd: Cmd) {
    if (cmd.href) router.push(cmd.href);
    if (cmd.action) cmd.action();
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[idx]) go(filtered[idx]);
    if (e.key === 'Escape') onClose();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: 580, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'scaleIn 0.12s ease' }}
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
            placeholder="Search projects, findings, actions…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 15, color: 'var(--ink-0)', fontFamily: 'var(--font-sans)' }}
          />
          <kbd style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 6px', background: 'var(--bg-2)', borderRadius: 3, border: '1px solid var(--line-1)', color: 'var(--ink-2)' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto' }} className="thin-scroll">
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>No results for &ldquo;{q}&rdquo;</div>
          )}
          {filtered.map((cmd, i) => (
            <div key={cmd.id}
                 onClick={() => go(cmd)}
                 style={{
                   display: 'flex', alignItems: 'center', gap: 12,
                   padding: '11px 18px', cursor: 'pointer',
                   background: i === idx ? 'var(--bg-3)' : 'transparent',
                   transition: 'background 0.08s',
                 }}
                 onMouseEnter={() => setIdx(i)}
            >
              <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--ink-2)' }}>
                <Ico name={cmd.icon} size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink-0)', fontWeight: 500 }}>{cmd.label}</div>
                {cmd.sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{cmd.sub}</div>}
              </div>
              <Ico name="chevRight" size={13} style={{ color: 'var(--ink-3)' }} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line-1)', display: 'flex', gap: 14, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
          <span><kbd style={{ padding: '1px 5px', background: 'var(--bg-2)', borderRadius: 3, border: '1px solid var(--line-1)', color: 'var(--ink-2)', marginRight: 3 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ padding: '1px 5px', background: 'var(--bg-2)', borderRadius: 3, border: '1px solid var(--line-1)', color: 'var(--ink-2)', marginRight: 3 }}>↵</kbd> open</span>
          <span style={{ marginLeft: 'auto' }}>Aegis Command · ⌘K</span>
        </div>
      </div>
    </div>
  );
}
