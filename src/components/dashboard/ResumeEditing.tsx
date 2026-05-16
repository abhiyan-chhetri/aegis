'use client';

/**
 * Dashboard "Resume Editing" widget.
 *
 * Shows the last few items the current user opened (project / finding / report)
 * pulled from the same localStorage key the command palette writes to, so
 * "what I was working on" persists across page reloads without a server table.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ico } from '@/components/chrome/icons';

type RecentItem = {
  id: string;
  label: string;
  sub?: string;
  href?: string;
  icon: string;
  severity?: string;
  type: string;
};

const RECENT_KEY = 'aegis.cmd.recent';
const RECENT_DISPLAY = 3;

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)',
  medium: 'var(--sev-medium)', low: 'var(--sev-low)',
  info: 'var(--sev-info, #5B9BD5)',
};

function loadRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentItem[];
    // Only show items that actually navigate somewhere — skip action commands
    return list.filter(r => !!r.href && r.type !== 'action' && r.type !== 'nav').slice(0, RECENT_DISPLAY);
  } catch { return []; }
}

export function ResumeEditing() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setItems(loadRecents());
    function onUpdate() { setItems(loadRecents()); }
    window.addEventListener('aegis:recent-updated', onUpdate);
    return () => window.removeEventListener('aegis:recent-updated', onUpdate);
  }, []);

  // SSR-safe: render nothing on first server pass to avoid hydration mismatch
  if (!mounted) return null;
  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Ico name="history" size={13} style={{ color: 'var(--ink-2)' }} />
          <div className="eyebrow" style={{ marginBottom: 0 }}>Resume editing</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
          Items you open will appear here. Press <kbd style={kbdStyle}>⌘K</kbd> to find anything across the platform.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 'var(--card-pad)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ico name="history" size={13} style={{ color: 'var(--ink-2)' }} />
        <div className="eyebrow" style={{ marginBottom: 0, flex: 1 }}>Resume editing</div>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
          last {items.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, i) => (
          <Link
            key={i}
            href={item.href || '#'}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--line-1)', background: 'var(--bg-2)',
              color: 'var(--ink-0)', textDecoration: 'none',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = 'var(--bg-3)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-1)'; e.currentTarget.style.background = 'var(--bg-2)'; }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: item.severity ? `color-mix(in srgb, ${SEV_COLOR[item.severity]} 18%, transparent)` : 'var(--bg-3)',
              color: item.severity ? SEV_COLOR[item.severity] : 'var(--ink-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ico name={item.icon} size={13} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
              {item.sub && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>}
            </div>
            <Ico name="chevRight" size={13} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px', background: 'var(--bg-2)', borderRadius: 3,
  border: '1px solid var(--line-1)', color: 'var(--ink-2)', fontSize: 10,
  fontFamily: 'var(--font-mono)',
};
