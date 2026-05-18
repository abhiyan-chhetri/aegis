'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Avatar, Ico } from '@/components/chrome/icons';

type Row = {
  id: string; type: string; title: string; body: string; link: string;
  read: boolean; createdAt: string;
  actorName: string | null; actorInitials: string | null;
  findingId: string | null;
};

const TYPE_META: Record<string, { icon: string; tint: string; label: string }> = {
  mention:           { icon: '@',  tint: 'var(--accent)',          label: 'Mention' },
  watch_status:     { icon: '↻',  tint: 'var(--sev-low)',         label: 'Status' },
  watch_severity:   { icon: '⚠',  tint: 'var(--sev-high)',        label: 'Severity' },
  watch_comment:    { icon: '💬', tint: 'var(--ink-2)',           label: 'Comment' },
  watch_assigned:   { icon: '👤', tint: 'var(--sev-medium)',      label: 'Assigned' },
  sla_breach_soon:  { icon: '⏳', tint: 'var(--sev-high)',        label: 'SLA' },
  sla_overdue:      { icon: '🔥', tint: 'var(--sev-critical)',    label: 'SLA' },
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [filter, setFilter] = useState<'all' | 'unread' | 'mention' | 'watch' | 'sla'>('all');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => rows.filter(r => {
    if (filter === 'unread') return !r.read;
    if (filter === 'mention') return r.type === 'mention';
    if (filter === 'watch') return r.type.startsWith('watch_');
    if (filter === 'sla') return r.type.startsWith('sla_');
    return true;
  }), [rows, filter]);

  async function markRead(ids: string[], read = true) {
    setBusy(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read }),
      });
      setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, read } : r));
    } finally { setBusy(false); }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, read: true }),
      });
      setRows(prev => prev.map(r => ({ ...r, read: true })));
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
      setRows(prev => prev.filter(r => r.id !== id));
    } finally { setBusy(false); }
  }

  const counts = {
    all: rows.length,
    unread: rows.filter(r => !r.read).length,
    mention: rows.filter(r => r.type === 'mention').length,
    watch: rows.filter(r => r.type.startsWith('watch_')).length,
    sla: rows.filter(r => r.type.startsWith('sla_')).length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        borderBottom: '1px solid var(--line-1)', background: 'var(--bg-1)',
        padding: '0 28px',
      }}>
        <div className="tab-bar" style={{ padding: 0, border: 'none', flex: 1 }}>
          {([
            ['all', 'All'], ['unread', 'Unread'], ['mention', 'Mentions'],
            ['watch', 'Watching'], ['sla', 'SLA'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              className={`tab${filter === k ? ' active' : ''}`}
              onClick={() => setFilter(k)}
            >
              {label}
              <span className="badge" style={{ marginLeft: 4, opacity: counts[k] === 0 ? 0.35 : 1 }}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-sm" disabled={busy || counts.unread === 0} onClick={markAllRead}>
          <Ico name="check" size={12} /> Mark all read
        </button>
      </div>

      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink-3)' }}>
            <Ico name="bell" size={28} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.25 }} />
            Nothing here. You&apos;ll see mentions, watcher updates and SLA alerts as they happen.
          </div>
        ) : filtered.map(r => {
          const meta = TYPE_META[r.type] || { icon: '•', tint: 'var(--ink-2)', label: r.type };
          return (
            <div
              key={r.id}
              style={{
                display: 'flex', gap: 12,
                padding: '14px 28px',
                borderBottom: '1px solid var(--line-1)',
                background: r.read ? 'transparent' : 'rgba(120,160,255,0.04)',
                cursor: 'default',
              }}
              onClick={() => !r.read && markRead([r.id], true)}
            >
              <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 6, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.tint, fontWeight: 700 }}>
                {r.actorInitials ? <Avatar name={r.actorName || ''} id={r.actorInitials} size={26} /> : <span style={{ fontSize: 14 }}>{meta.icon}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: meta.tint }}>{meta.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{timeAgo(r.createdAt)}</span>
                  {!r.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)', marginBottom: 2 }}>{r.title}</div>
                {r.body && <div style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 720 }}>{r.body}</div>}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                {r.link && (
                  <Link href={r.link} className="btn btn-ghost btn-sm" onClick={() => markRead([r.id], true)} style={{ textDecoration: 'none' }}>
                    Open <Ico name="chevRight" size={12} />
                  </Link>
                )}
                {!r.read ? (
                  <button className="btn btn-ghost btn-sm" title="Mark read" onClick={() => markRead([r.id], true)} disabled={busy}>
                    <Ico name="check" size={13} />
                  </button>
                ) : (
                  <button className="btn btn-ghost btn-sm" title="Mark unread" onClick={() => markRead([r.id], false)} disabled={busy}>
                    <Ico name="bell" size={13} />
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => remove(r.id)} disabled={busy}>
                  <Ico name="x" size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
