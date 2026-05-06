'use client';

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

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-3)' }}>
        <Ico name="activity" size={24} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
        <div style={{ fontSize: 13 }}>No activity yet</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activities.map((activity) => {
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
  );
}
