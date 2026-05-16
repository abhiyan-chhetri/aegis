'use client';

/**
 * Global UI overlays mounted once at the layout level:
 *   - Theme toggle (T or via command palette)  → flips html[data-theme]
 *   - Keyboard shortcuts modal (?)             → press ? to open / Esc to close
 *
 * Listens for window events emitted by the command palette so users can
 * trigger both features from inside the ⌘K menu as well as via shortcuts.
 */

import React, { useEffect, useState } from 'react';
import { Ico } from './icons';
import { ToastViewport } from '@/components/ui/Toast';

// ─── Theme ───────────────────────────────────────────────────────────────────
const THEME_KEY = 'aegis.theme';

function applyTheme(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore quota */ }
}

function readStoredTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  return 'dark';
}

// ─── Shortcut list (kept in one place so the modal is the source of truth) ───
interface Shortcut { keys: string; label: string; group: string; }
const SHORTCUTS: Shortcut[] = [
  { group: 'Navigation', keys: '⌘ K / Ctrl K', label: 'Open command palette (search anywhere)' },
  { group: 'Navigation', keys: 'G then D',     label: 'Go to Dashboard' },
  { group: 'Navigation', keys: 'G then I',     label: 'Go to Inbox' },
  { group: 'Navigation', keys: 'G then P',     label: 'Go to Projects' },
  { group: 'Navigation', keys: 'G then L',     label: 'Go to Vulnerability Library' },
  { group: 'Navigation', keys: 'G then R',     label: 'Go to Reports' },
  { group: 'Navigation', keys: 'G then S',     label: 'Go to Settings' },
  { group: 'Navigation', keys: 'G then C',     label: 'Go to Changelog' },
  { group: 'Appearance', keys: 'T',            label: 'Toggle light / dark theme' },
  { group: 'Help',       keys: '?',            label: 'Show this shortcut sheet' },
  { group: 'Editor',     keys: '⌘ ↩ / Ctrl ↩', label: 'Generate finding section with AI' },
  { group: 'Editor',     keys: '⌘ S / Ctrl S', label: 'Save (auto-save also runs on idle)' },
  { group: 'Editor',     keys: 'Esc',          label: 'Close modal / exit fullscreen' },
  { group: 'Lists',      keys: '↑ ↓',          label: 'Navigate command results' },
  { group: 'Lists',      keys: '↵',            label: 'Open selected result' },
];

// ─────────────────────────────────────────────────────────────────────────────
export function ChromeOverlays() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Track "G" key for chord shortcuts (G then D, G then L, etc.)
  const [chord, setChord] = useState<string | null>(null);

  // Apply stored theme on mount
  useEffect(() => {
    const t = readStoredTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  // Toggle helper (also exposed via custom event)
  const toggleTheme = React.useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  // Window event subscriptions
  useEffect(() => {
    function onToggle() { toggleTheme(); }
    function onShortcuts() { setShortcutsOpen(true); }
    window.addEventListener('aegis:theme-toggle', onToggle);
    window.addEventListener('aegis:shortcuts-open', onShortcuts);
    return () => {
      window.removeEventListener('aegis:theme-toggle', onToggle);
      window.removeEventListener('aegis:shortcuts-open', onShortcuts);
    };
  }, [toggleTheme]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc closes the shortcuts sheet
      if (e.key === 'Escape' && shortcutsOpen) { setShortcutsOpen(false); return; }
      // Ignore shortcuts when user is typing into an input / textarea / contenteditable
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // ? → open shortcuts
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); setShortcutsOpen(true); return; }
      // T → toggle theme
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheme(); return; }
      // G chord
      if (e.key === 'g' || e.key === 'G') { setChord('g'); setTimeout(() => setChord(null), 1200); return; }
      if (chord === 'g') {
        const map: Record<string, string> = {
          d: '/dashboard', D: '/dashboard',
          p: '/projects',  P: '/projects',
          l: '/library',   L: '/library',
          r: '/reports',   R: '/reports',
          s: '/settings',  S: '/settings',
          c: '/changelog', C: '/changelog',
          t: '/team',      T: '/team',
          a: '/audit-trail', A: '/audit-trail',
          i: '/inbox',     I: '/inbox',
        };
        const path = map[e.key];
        if (path) { e.preventDefault(); setChord(null); window.location.href = path; }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chord, toggleTheme, shortcutsOpen]);

  return (
    <>
      {/* Toast queue — bottom-right, above the theme button */}
      <ToastViewport />
      {/* Floating theme button (bottom-right). Discreet, always available. */}
      <button
        onClick={toggleTheme}
        title={`${theme === 'dark' ? 'Switch to light' : 'Switch to dark'} (T)`}
        style={{
          position: 'fixed', bottom: 18, right: 18, zIndex: 999,
          width: 38, height: 38, borderRadius: '50%',
          background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          color: 'var(--ink-1)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <Ico name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
      </button>

      {/* G-chord toast */}
      {chord === 'g' && (
        <div style={{
          position: 'fixed', bottom: 72, right: 18, zIndex: 999,
          padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-sm)', fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--ink-2)', boxShadow: 'var(--shadow-md)',
        }}>
          <kbd style={{ background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 3 }}>G</kbd>{' '}
          then press <b>D · P · L · R · T · S · A · C</b>
        </div>
      )}

      {/* Shortcuts modal */}
      {shortcutsOpen && (
        <div
          onClick={() => setShortcutsOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 640, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
          >
            {/* Header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ico name="keyboard" size={16} style={{ color: 'var(--ink-2)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)' }}>Keyboard Shortcuts</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>Press <kbd style={kbdStyle}>?</kbd> anywhere to open this sheet.</div>
              </div>
              <button onClick={() => setShortcutsOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>
                <Ico name="x" size={16} />
              </button>
            </div>
            {/* Groups */}
            <div className="thin-scroll" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '8px 8px 16px' }}>
              {Array.from(new Set(SHORTCUTS.map(s => s.group))).map(group => (
                <div key={group} style={{ padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SHORTCUTS.filter(s => s.group === group).map(s => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', borderRadius: 'var(--r-xs)' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-1)' }}>{s.label}</span>
                        <kbd style={kbdStyleLarge}>{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line-1)', display: 'flex', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
              <span><kbd style={kbdStyle}>Esc</kbd> close</span>
              <span style={{ marginLeft: 'auto' }}>Aegis · keyboard shortcuts</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px', background: 'var(--bg-2)', borderRadius: 3,
  border: '1px solid var(--line-1)', color: 'var(--ink-2)', fontSize: 10,
  fontFamily: 'var(--font-mono)',
};
const kbdStyleLarge: React.CSSProperties = {
  padding: '3px 9px', background: 'var(--bg-2)', borderRadius: 4,
  border: '1px solid var(--line-1)', color: 'var(--ink-1)', fontSize: 11,
  fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};
