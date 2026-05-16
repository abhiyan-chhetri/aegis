import { connection } from 'next/server';
import Link from 'next/link';
import React from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: string;
  createdAt: string;
  userName: string;
}

const ID_RE = /^[a-z0-9]{20,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 50;

type Props = { searchParams: Promise<{ page?: string; size?: string }> };

export default async function AuditTrailPage({ searchParams }: Props) {
  await connection();
  const session = await getSession();
  if (!session) redirect('/login');

  // ── Pagination params ──────────────────────────────────────────────────────
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.size || `${DEFAULT_PAGE_SIZE}`, 10) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  // ── Data ───────────────────────────────────────────────────────────────────
  const [rows, totalRows, allUsers] = await Promise.all([
    db.$queryRawUnsafe<AuditRow[]>(
      `SELECT al.id, al.action, al."entityType", al."entityId", al.changes, al."createdAt",
              u.name as "userName"
       FROM "AuditLog" al
       JOIN "User" u ON u.id = al."userId"
       ORDER BY al."createdAt" DESC
       LIMIT $1 OFFSET $2`,
      pageSize,
      offset,
    ),
    db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "AuditLog"`)
      .then(r => Number(r[0]?.count ?? 0)),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);

  const userMap = new Map(allUsers.map(u => [u.id, u.name]));
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const start = totalRows === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, totalRows);

  const getActionColor = (action: string) => {
    if (['create', 'add'].some(k => action.includes(k))) return 'var(--status-resolved)';
    if (['delete', 'remove'].some(k => action.includes(k))) return 'var(--sev-critical)';
    if (['approve'].some(k => action.includes(k))) return 'var(--status-resolved)';
    if (['reject'].some(k => action.includes(k))) return 'var(--sev-critical)';
    if (['update', 'edit', 'submit'].some(k => action.includes(k))) return 'var(--status-progress)';
    return 'var(--ink-2)';
  };

  // Render a single primitive value sensibly: resolve user-ids to names,
  // collapse arrays / nested objects to compact human-readable strings instead
  // of the JS default "[object Object]".
  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) {
      if (v.length === 0) return '∅';
      // Special-case rescore_environmental changes: array of { code, from, to }
      if (v.every(item => typeof item === 'object' && item !== null && 'code' in item && 'from' in item && 'to' in item)) {
        const items = v as { code: string; from: number; to: number; severity?: string }[];
        const preview = items.slice(0, 5).map(c => `${c.code}: ${c.from.toFixed(1)}→${c.to.toFixed(1)}`).join(', ');
        return items.length > 5 ? `${preview} (+${items.length - 5} more)` : preview;
      }
      // Generic array
      return v.map(formatValue).join(', ');
    }
    if (typeof v === 'object') {
      // Generic object: render as "k:v · k:v"
      return Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== null && val !== '' && val !== undefined)
        .map(([k, val]) => `${k}: ${formatValue(val)}`)
        .join(' · ') || '{}';
    }
    const raw = String(v);
    return ID_RE.test(raw) ? (userMap.get(raw) ?? raw) : raw;
  };

  const formatChanges = (json: string): string => {
    try {
      const obj = JSON.parse(json);
      return Object.entries(obj)
        .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => {
          const label = k.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
          return `${label}: ${formatValue(v)}`;
        })
        .join(' · ');
    } catch { return '—'; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Audit Trail']}
        title="Audit Trail"
        subtitle={`${totalRows.toLocaleString()} total events`}
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

        <div style={{ background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
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
          ) : rows.map((row, i) => (
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
              <span style={{ fontSize: 12.5, color: 'var(--ink-1)', fontWeight: 500 }}>{row.userName}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: getActionColor(row.action), textTransform: 'capitalize', fontFamily: 'var(--font-mono)' }}>
                {row.action}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{row.entityType}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                {formatChanges(row.changes)}
              </span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalRows > 0 && (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalRows={totalRows}
            totalPages={totalPages}
            start={start}
            end={end}
            basePath="/audit-trail"
          />
        )}
      </div>
    </div>
  );
}

// ── Reusable server-rendered pagination control ─────────────────────────────
function PaginationBar({ page, pageSize, totalRows, totalPages, start, end, basePath }: {
  page: number; pageSize: number; totalRows: number; totalPages: number;
  start: number; end: number; basePath: string;
}) {
  const buildHref = (p: number) =>
    pageSize === DEFAULT_PAGE_SIZE ? `${basePath}?page=${p}` : `${basePath}?page=${p}&size=${pageSize}`;

  // Show a windowed range of page numbers — first, last, and ±2 around current.
  const pages = new Set<number>();
  pages.add(1); pages.add(totalPages);
  for (let i = page - 2; i <= page + 2; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }
  const pageList = Array.from(pages).sort((a, b) => a - b);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 12, marginTop: 18, padding: '12px 0',
      borderTop: '1px solid var(--line-1)', fontSize: 11.5, color: 'var(--ink-2)',
      fontFamily: 'var(--font-mono)',
    }}>
      <div>Showing {start.toLocaleString()}–{end.toLocaleString()} of {totalRows.toLocaleString()}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <PageBtn href={buildHref(1)} disabled={page === 1} title="First page">«</PageBtn>
        <PageBtn href={buildHref(Math.max(1, page - 1))} disabled={page === 1} title="Previous page">
          <Ico name="chevLeft" size={12} />
        </PageBtn>
        {pageList.map((p, i) => {
          const prev = pageList[i - 1];
          const showDots = prev !== undefined && p - prev > 1;
          return (
            <React.Fragment key={p}>
              {showDots && <span style={{ padding: '0 4px', color: 'var(--ink-3)' }}>…</span>}
              <PageBtn href={buildHref(p)} active={p === page}>{String(p)}</PageBtn>
            </React.Fragment>
          );
        })}
        <PageBtn href={buildHref(Math.min(totalPages, page + 1))} disabled={page === totalPages} title="Next page">
          <Ico name="chevRight" size={12} />
        </PageBtn>
        <PageBtn href={buildHref(totalPages)} disabled={page === totalPages} title="Last page">»</PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ href, children, active, disabled, title }: {
  href: string; children: React.ReactNode; active?: boolean; disabled?: boolean; title?: string;
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 28, height: 26, padding: '0 8px',
    border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--line-1)',
    borderRadius: 'var(--r-xs)',
    background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--ink-2)',
    fontSize: 11, fontFamily: 'var(--font-mono)',
    textDecoration: 'none',
    opacity: disabled ? 0.4 : 1,
    pointerEvents: disabled ? 'none' : undefined,
  };
  return (
    <Link href={href} style={style} title={title} aria-disabled={disabled}>{children}</Link>
  );
}
