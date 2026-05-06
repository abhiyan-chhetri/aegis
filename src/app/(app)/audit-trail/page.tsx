import React from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: string;
  createdAt: string;
  userName: string;
}

// Detects cuid / uuid-style IDs (long alphanumeric strings with no spaces)
const ID_RE = /^[a-z0-9]{20,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditTrailPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [rows, allUsers] = await Promise.all([
    db.$queryRawUnsafe<AuditRow[]>(
      `SELECT al.id, al.action, al.entityType, al.entityId, al.changes, al.createdAt,
              u.name as userName
       FROM AuditLog al
       JOIN User u ON u.id = al.userId
       ORDER BY al.createdAt DESC
       LIMIT 200`
    ),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);

  // Build an id→name map for fast lookup
  const userMap = new Map(allUsers.map(u => [u.id, u.name]));

  const getActionColor = (action: string) => {
    if (['create', 'add'].some(k => action.includes(k))) return 'var(--status-resolved)';
    if (['delete', 'remove'].some(k => action.includes(k))) return 'var(--sev-critical)';
    if (['approve'].some(k => action.includes(k))) return 'var(--status-resolved)';
    if (['reject'].some(k => action.includes(k))) return 'var(--sev-critical)';
    if (['update', 'edit', 'submit'].some(k => action.includes(k))) return 'var(--warn)';
    return 'var(--ink-2)';
  };

  const formatChanges = (json: string): string => {
    try {
      const obj = JSON.parse(json);
      return Object.entries(obj)
        .filter(([, v]) => v !== null && v !== '')
        .map(([k, v]) => {
          const raw = String(v);
          // If the value looks like a user ID, resolve it to a name
          const resolved = ID_RE.test(raw) ? (userMap.get(raw) ?? raw) : raw;
          // Make the key more readable: camelCase → spaced words
          const label = k.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
          return `${label}: ${resolved}`;
        })
        .join(' · ');
    } catch { return '—'; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Audit Trail']}
        title="Audit Trail"
        subtitle={`${rows.length} events`}
      />

      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-1)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: 'var(--r-sm)',
          marginBottom: '24px',
          fontSize: 13,
          color: 'var(--ink-2)',
        }}>
          Full activity log — every create, update, approve, reject and submission is recorded here for compliance.
        </div>

        <div style={{
          background: 'var(--bg-0)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '160px 140px 90px 110px 1fr',
            padding: '9px 20px',
            background: 'var(--bg-1)',
            borderBottom: '1px solid var(--line-1)',
          }}>
            {['Timestamp', 'User', 'Action', 'Entity', 'Changes'].map(h => (
              <span key={h} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
                {h}
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink-3)' }}>
              No audit events yet
            </div>
          ) : (rows as AuditRow[]).map((row, i) => (
            <div key={row.id} style={{
              display: 'grid',
              gridTemplateColumns: '160px 140px 90px 110px 1fr',
              padding: '11px 20px',
              borderBottom: i < rows.length - 1 ? '1px solid var(--line-1)' : 'none',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {new Date(row.createdAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-1)', fontWeight: 500 }}>
                {row.userName}
              </span>
              <span style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: getActionColor(row.action),
                textTransform: 'capitalize',
                fontFamily: 'var(--font-mono)',
              }}>
                {row.action}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-2)', textTransform: 'capitalize' }}>
                {row.entityType}
              </span>
              <span style={{
                fontSize: 11.5,
                color: 'var(--ink-3)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)',
              }}>
                {formatChanges(row.changes)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
