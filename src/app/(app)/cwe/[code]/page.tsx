/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Sev, StatusPill } from '@/components/ui/SevBadge';
import { connection } from 'next/server';

/**
 * /cwe/[code] — drilldown for a single CWE.
 *
 * Shows every finding ever logged under this CWE across all projects,
 * plus a small trend block: remediation time, severity mix, top affected
 * projects. Linked from any finding row whose CWE pill is clicked.
 */

interface Row {
  id: string; code: string; title: string; severity: string; status: string;
  cwe: string; createdAt: Date; updatedAt: Date; assigneeName: string | null;
  projectId: string; projectName: string; projectCode: string;
  discovered: string;
}

function daysBetween(a: Date | string, b: Date | string): number {
  const t = (v: Date | string) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
  return Math.max(0, Math.round((t(b) - t(a)) / (24 * 60 * 60 * 1000)));
}

export default async function CweDrilldown({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);

  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT f.id, f.code, f.title, f.severity, f.status, f.cwe, f."createdAt", f."updatedAt",
            f.discovered,
            u.name AS "assigneeName",
            p.id   AS "projectId",
            p.name AS "projectName",
            p.code AS "projectCode"
     FROM "Finding" f
     LEFT JOIN "User" u ON u.id = f."assigneeId"
     JOIN "Project" p ON p.id = f."projectId"
     WHERE f.cwe = $1
     ORDER BY f."createdAt" DESC`,
    code,
  ).catch(() => [] as Row[]);

  const total = rows.length;
  const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const statusCounts: Record<string, number> = { open: 0, 'in-progress': 0, 'in-review': 0, resolved: 0, accepted: 0 };
  const projectFreq: Record<string, { name: string; code: string; count: number; id: string }> = {};
  let resolvedSum = 0;
  let resolvedN = 0;

  for (const r of rows) {
    if (r.severity in sevCounts) sevCounts[r.severity]++;
    if (r.status in statusCounts) statusCounts[r.status]++;
    if (!projectFreq[r.projectId]) projectFreq[r.projectId] = { id: r.projectId, name: r.projectName, code: r.projectCode, count: 0 };
    projectFreq[r.projectId].count++;
    if (r.status === 'resolved') {
      resolvedSum += daysBetween(r.createdAt, r.updatedAt);
      resolvedN++;
    }
  }
  const avgResolveDays = resolvedN ? Math.round(resolvedSum / resolvedN) : null;
  const topProjects = Object.values(projectFreq).sort((a, b) => b.count - a.count).slice(0, 5);

  // Trend: count of new findings per ISO month for the last 12 months
  const now = new Date();
  const months: { key: string; label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
      count: 0,
    });
  }
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const slot = months.find(m => m.key === k);
    if (slot) slot.count++;
  }
  const maxMonth = Math.max(1, ...months.map(m => m.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Library', 'CWE', code]}
        title={code || 'CWE'}
        subtitle={`${total} finding${total === 1 ? '' : 's'} across ${Object.keys(projectFreq).length} project${Object.keys(projectFreq).length === 1 ? '' : 's'}`}
      />

      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {total === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>
            No findings recorded under <span className="mono">{code}</span> yet.
            {' '}
            <Link href="/library" style={{ color: 'var(--accent)' }}>Back to library</Link>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
              <SummaryCard label="Total findings" value={String(total)} />
              <SummaryCard label="Open" value={String(statusCounts.open + statusCounts['in-progress'] + statusCounts['in-review'])} />
              <SummaryCard label="Resolved" value={String(statusCounts.resolved)} />
              <SummaryCard label="Avg time to resolve" value={avgResolveDays !== null ? `${avgResolveDays}d` : '—'} />
            </div>

            {/* Severity strip */}
            <div style={{ display: 'flex', gap: 18, padding: '10px 12px', background: 'var(--bg-1)', borderRadius: 'var(--r-md)', marginBottom: 24 }}>
              {(['critical','high','medium','low','info'] as const).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18, fontFamily: 'var(--font-serif)', color: `var(--sev-${s})` }}>{sevCounts[s]}</span>
                  <span style={{ fontSize: 11, color: `var(--sev-${s})`, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s}</span>
                </div>
              ))}
            </div>

            {/* Trend */}
            <div style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Trend (last 12 months)</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '6px 0', borderBottom: '1px solid var(--line-1)' }}>
                {months.map(m => (
                  <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
                    <div title={`${m.count} finding${m.count === 1 ? '' : 's'}`} style={{
                      width: '100%',
                      height: `${(m.count / maxMonth) * 100}%`,
                      minHeight: m.count > 0 ? 2 : 0,
                      background: m.count > 0 ? 'var(--accent)' : 'transparent',
                      borderRadius: '3px 3px 0 0',
                      transition: 'background 0.2s',
                    }} />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top affected projects */}
            <div style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Top affected projects</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topProjects.map(p => (
                  <Link key={p.id} href={`/projects/${p.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-1)', borderRadius: 'var(--r-sm)', textDecoration: 'none', color: 'var(--ink-0)' }}>
                    <span style={{ fontSize: 13 }}>
                      <span className="mono" style={{ color: 'var(--ink-3)', marginRight: 8 }}>{p.code}</span>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{p.count} finding{p.count === 1 ? '' : 's'}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Findings list */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>All findings</div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>ID</th>
                  <th>Title</th>
                  <th style={{ width: 140 }}>Project</th>
                  <th style={{ width: 100 }}>Severity</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 110 }}>Discovered</th>
                  <th style={{ width: 110 }}>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td><Link href={`/projects/${r.projectId}/findings/${r.id}`} className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', textDecoration: 'none' }}>{r.code}</Link></td>
                    <td><Link href={`/projects/${r.projectId}/findings/${r.id}`} style={{ color: 'var(--ink-0)', textDecoration: 'none' }}>{r.title}</Link></td>
                    <td><Link href={`/projects/${r.projectId}`} className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', textDecoration: 'none' }}>{r.projectCode}</Link></td>
                    <td><Sev level={r.severity} size="sm" /></td>
                    <td><StatusPill status={r.status} /></td>
                    <td><span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{r.discovered}</span></td>
                    <td>{r.assigneeName ? <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{r.assigneeName.split(' ')[0]}</span> : <span style={{ color: 'var(--ink-4)' }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: 16, background: 'var(--bg-1)',
      border: '1px solid var(--line-1)', borderRadius: 'var(--r-md)',
    }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: 'var(--ink-0)', lineHeight: 1 }}>{value}</div>
    </div>
  );
}
