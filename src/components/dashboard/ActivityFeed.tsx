'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Ico } from '@/components/chrome/icons';

interface Activity {
  id: string;
  action: string;
  target: string;
  detail: string;
  badge: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    initials: string;
  };
  project: {
    id: string;
    code: string;
    name: string;
  } | null;
  finding: {
    id: string;
    code: string;
  } | null;
}

function getActionIcon(action: string): string {
  switch (action) {
    case 'created':
      return 'plus';
    case 'updated':
      return 'edit';
    case 'commented':
      return 'message';
    case 'status_changed':
      return 'checkCircle';
    case 'assigned':
      return 'user';
    case 'dismiss_mention':
      return 'check';
    default:
      return 'activity';
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case 'created':
      return 'var(--sev-critical)';
    case 'updated':
      return 'var(--accent)';
    case 'commented':
      return 'var(--ink-2)';
    case 'status_changed':
      return 'var(--status-resolved)';
    case 'assigned':
      return 'var(--accent)';
    case 'dismiss_mention':
      return 'var(--status-resolved)';
    default:
      return 'var(--ink-3)';
  }
}

function getActionDescription(action: string): string {
  switch (action) {
    case 'created':
      return 'created new finding';
    case 'updated':
      return 'made updates to';
    case 'commented':
      return 'left a comment on';
    case 'status_changed':
      return 'changed the status of';
    case 'assigned':
      return 'assigned';
    case 'dismiss_mention':
      return 'dismissed a mention';
    default:
      return action;
  }
}

function formatFieldName(field: string): string {
  const map: Record<string, string> = {
    'reproduction': 'Reproduction Steps',
    'description': 'Description',
    'impact': 'Impact',
    'remediation': 'Remediation',
    'references': 'References',
    'cwe': 'CWE',
    'owasp': 'OWASP',
    'cvss': 'CVSS Score',
    'cvssVector': 'CVSS Vector',
    'title': 'Title',
    'severity': 'Severity',
    'status': 'Status',
    'assets': 'Assets',
    'component': 'Component',
    'discovered': 'Discovered Date',
  };
  return map[field] || field;
}

// Known action types — used to populate the chip filter
const ACTION_TYPES = [
  { key: 'created',        label: 'Created' },
  { key: 'updated',        label: 'Updated' },
  { key: 'commented',      label: 'Commented' },
  { key: 'status_changed', label: 'Status' },
  { key: 'assigned',       label: 'Assigned' },
];

// Date-range chips. Empty key = no filter.
const RANGE_PRESETS: { key: '' | '24h' | '7d' | '30d' | '90d'; label: string }[] = [
  { key: '',    label: 'All time' },
  { key: '24h', label: 'Last 24h' },
  { key: '7d',  label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

function rangeStart(key: string): number {
  if (!key) return 0;
  const now = Date.now();
  if (key === '24h') return now - 24 * 3600 * 1000;
  if (key === '7d')  return now - 7  * 86400 * 1000;
  if (key === '30d') return now - 30 * 86400 * 1000;
  if (key === '90d') return now - 90 * 86400 * 1000;
  return 0;
}

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  const [q, setQ] = useState('');
  const [userFilter, setUserFilter] = useState<string>(''); // user id
  const [actionFilter, setActionFilter] = useState<string>('');
  const [range, setRange] = useState<string>('');

  // Unique user list for the user-filter dropdown
  const users = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; initials: string }>();
    for (const a of activities) {
      if (a.user && !seen.has(a.user.id)) seen.set(a.user.id, a.user);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activities]);

  const filtered = useMemo(() => {
    const since = rangeStart(range);
    const qLower = q.trim().toLowerCase();
    return activities.filter(a => {
      if (userFilter && a.user?.id !== userFilter) return false;
      if (actionFilter && a.action !== actionFilter) return false;
      if (since && new Date(a.createdAt).getTime() < since) return false;
      if (qLower) {
        const hay = `${a.action} ${a.target} ${a.detail} ${a.user?.name ?? ''} ${a.project?.name ?? ''} ${a.project?.code ?? ''} ${a.finding?.code ?? ''}`.toLowerCase();
        if (!qLower.split(/\s+/).every(t => hay.includes(t))) return false;
      }
      return true;
    });
  }, [activities, q, userFilter, actionFilter, range]);

  const hasAnyFilter = !!q || !!userFilter || !!actionFilter || !!range;

  // ── Filter bar ─────────────────────────────────────────────────────────────
  const FilterBar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Ico name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
        <input
          className="input"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search activity (action, project, finding, user)…"
          style={{ paddingLeft: 30, width: '100%', height: 32, fontSize: 12.5 }}
        />
        {hasAnyFilter && (
          <button
            onClick={() => { setQ(''); setUserFilter(''); setActionFilter(''); setRange(''); }}
            title="Clear all filters"
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--ink-3)', padding: 4, display: 'flex',
            }}
          >
            <Ico name="x" size={13} />
          </button>
        )}
      </div>

      {/* Chip rows */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={chipLabelStyle}>Action</span>
        <Chip active={!actionFilter} onClick={() => setActionFilter('')}>All</Chip>
        {ACTION_TYPES.map(a => (
          <Chip key={a.key} active={actionFilter === a.key} onClick={() => setActionFilter(actionFilter === a.key ? '' : a.key)}>
            {a.label}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={chipLabelStyle}>When</span>
        {RANGE_PRESETS.map(r => (
          <Chip key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </Chip>
        ))}
      </div>

      {users.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={chipLabelStyle}>User</span>
          <Chip active={!userFilter} onClick={() => setUserFilter('')}>Anyone</Chip>
          {users.map(u => (
            <Chip
              key={u.id}
              active={userFilter === u.id}
              onClick={() => setUserFilter(userFilter === u.id ? '' : u.id)}
            >
              <span style={{
                display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                background: 'var(--bg-3)', color: 'var(--ink-2)',
                fontSize: 8, lineHeight: '14px', textAlign: 'center', marginRight: 5,
                fontFamily: 'var(--font-mono)',
              }}>{u.initials}</span>
              {u.name}
            </Chip>
          ))}
        </div>
      )}

      {/* Result count */}
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
        {filtered.length} of {activities.length} {hasAnyFilter ? 'matching' : 'total'} {filtered.length === 1 ? 'event' : 'events'}
      </div>
    </div>
  );

  if (activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-3)' }}>
        <Ico name="activity" size={24} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
        <div style={{ fontSize: 13 }}>No activity yet</div>
      </div>
    );
  }

  return (
    <>
      {FilterBar}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--ink-3)', fontSize: 12.5 }}>
          No activity matches the current filters.
        </div>
      ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {filtered.map((activity) => {
        const timeAgo = (() => {
          const date = new Date(activity.createdAt);
          const now = new Date();
          const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

          if (seconds < 60) return 'just now';
          if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
          if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
          return `${Math.floor(seconds / 86400)}d ago`;
        })();

        const actionDescription = getActionDescription(activity.action);
        const icon = getActionIcon(activity.action);
        const color = getActionColor(activity.action);

        // Format detail text based on action type
        let detailText = '';
        let isQuote = false;

        if (activity.action === 'updated') {
          const fields = activity.detail.includes('Updated:')
            ? activity.detail.replace('Updated: ', '').split(', ')
            : activity.detail.split(', ').map(f => formatFieldName(f.trim()));
          detailText = `Updated ${fields.length} field${fields.length > 1 ? 's' : ''}: ${fields.join(', ')}`;
        } else if (activity.action === 'commented') {
          detailText = activity.detail;
          isQuote = true;
        } else if (activity.action === 'status_changed') {
          detailText = activity.detail;
        } else if (activity.action === 'assigned') {
          detailText = activity.detail;
        } else if (activity.action === 'created') {
          detailText = activity.detail;
        }

        const actDate = new Date(activity.createdAt);
        const currentYear = new Date().getFullYear();
        const actYear = actDate.getFullYear();
        const formattedDate = actDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: actYear !== currentYear ? 'numeric' : undefined,
        });

        return (
          <div
            key={activity.id}
            style={{
              padding: '16px 0',
              borderBottom: '1px solid var(--line-1)',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--bg-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ink-1)',
                flexShrink: 0,
              }}
            >
              {activity.user.initials}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Header: User + Action */}
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--ink-0)', fontSize: 13 }}>
                  {activity.user.name}
                </span>
                <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                  {' '}{actionDescription}{' '}
                </span>
              </div>

              {/* Title/Target - prominent */}
              {activity.action === 'dismiss_mention' ? (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)' }}>
                    Mention dismissed
                  </span>
                </div>
              ) : activity.action === 'created' && !activity.finding ? (
                // Project creation
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)' }}>
                    {activity.target}
                  </span>
                </div>
              ) : activity.finding ? (
                <div style={{ marginBottom: 8 }}>
                  <Link
                    href={`/projects/${activity.project?.id}/findings/${activity.finding.id}`}
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--accent)',
                      textDecoration: 'none',
                      display: 'inline-block',
                      paddingBottom: 2,
                    }}
                  >
                    "{activity.target}"
                  </Link>
                  {activity.project && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
                      {activity.finding.code} in {activity.project.code}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Detail section */}
              {detailText && activity.action !== 'dismiss_mention' && (
                <div style={{ marginBottom: 8 }}>
                  {isQuote ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ink-2)',
                        fontStyle: 'italic',
                        lineHeight: 1.5,
                        maxWidth: '600px',
                      }}
                      title={detailText}
                    >
                      "{detailText}"
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                      {detailText}
                    </div>
                  )}
                </div>
              )}

              {/* Footer: Badge + Time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                {activity.badge && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: `${color}15`,
                      color: color,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontSize: 9,
                    }}
                  >
                    {activity.badge}
                  </span>
                )}
                <span style={{ color: 'var(--ink-3)' }}>
                  {timeAgo}
                </span>
                <span style={{ color: 'var(--ink-4)' }}>
                  {formattedDate}
                </span>
              </div>
            </div>

            {/* Icon */}
            <div style={{ flexShrink: 0, color, opacity: 0.4, marginTop: 2 }}>
              <Ico name={icon} size={16} />
            </div>
          </div>
        );
      })}
    </div>
      )}
    </>
  );
}

// ── Tiny chip used by the filter bar ────────────────────────────────────────
function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 24, padding: '0 10px', borderRadius: 100,
        border: '1px solid',
        borderColor: active ? 'var(--accent)' : 'var(--line-1)',
        background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--ink-2)',
        fontSize: 11, fontFamily: 'var(--font-mono)',
        cursor: 'pointer', transition: 'all 0.12s',
        whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}

const chipLabelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 4,
};
