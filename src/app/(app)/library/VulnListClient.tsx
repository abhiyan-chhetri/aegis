'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Ico } from '@/components/chrome/icons';
import { Sev, StatusPill } from '@/components/ui/SevBadge';

type Finding = {
  id: string;
  code: string;
  title: string;
  severity: string;
  status: string;
  cvss: number;
  cwe: string;
  owasp: string;
  summary: string;
  description: string;
  impact: string;
  remediation: string;
  createdAt: string;
  project: { id: string; name: string; code: string };
  assignee: { id: string; name: string; initials: string } | null;
};

type Project = { id: string; name: string; code: string };

type Props = {
  findings: Finding[];
  projects: Project[];
};

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function FindingSlideOver({ item, onClose, onStatusChange }: {
  item: Finding;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    setSaving(true);
    try {
      await fetch(`/api/findings/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      onStatusChange(item.id, newStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40 }} />
      <div className="thin-scroll" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 560,
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line-2)',
        boxShadow: 'var(--shadow-lg)', zIndex: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* header */}
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid var(--line-1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.code}</span>
                <Sev level={item.severity} size="sm" />
                <StatusPill status={item.status} />
                {item.cwe && <span className="badge mono">{item.cwe}</span>}
              </div>
              <h2 className="serif" style={{ margin: 0, fontSize: 19, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1.3 }}>
                {item.title}
              </h2>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
                {item.project.name} · {item.project.code}
                {item.cvss > 0 && <span style={{ marginLeft: 8 }}>CVSS {item.cvss}</span>}
              </div>
            </div>
            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0, flexShrink: 0 }}>
              <Ico name="x" size={14} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Status control */}
          <div style={{ marginBottom: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['open', 'in-progress', 'in-review', 'resolved', 'accepted'].map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={saving}
                  style={{
                    padding: '5px 12px', borderRadius: 'var(--r-sm)', fontSize: 12,
                    border: '1px solid', cursor: 'pointer',
                    borderColor: status === s ? 'var(--line-3)' : 'var(--line-1)',
                    background: status === s ? 'var(--bg-3)' : 'var(--bg-0)',
                    color: status === s ? 'var(--ink-0)' : 'var(--ink-2)',
                    transition: 'all 0.1s',
                  }}
                >
                  {s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          {item.summary && (
            <section style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Summary</div>
              <p style={{ margin: 0, color: 'var(--ink-1)', fontSize: 13.5, lineHeight: 1.7 }}>{item.summary}</p>
            </section>
          )}
          {item.description && (
            <section style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Description</div>
              <p style={{ margin: 0, color: 'var(--ink-1)', fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.description}</p>
            </section>
          )}
          {item.impact && (
            <section style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Impact</div>
              <p style={{ margin: 0, color: 'var(--ink-1)', fontSize: 13.5, lineHeight: 1.7 }}>{item.impact}</p>
            </section>
          )}
          {item.remediation && (
            <section style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Remediation</div>
              <div style={{ background: 'rgba(143,201,122,0.06)', border: '1px solid rgba(143,201,122,0.15)', borderRadius: 'var(--r-md)', padding: 16 }}>
                <p style={{ margin: 0, color: 'var(--ink-1)', fontSize: 13.5, lineHeight: 1.7 }}>{item.remediation}</p>
              </div>
            </section>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line-1)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link
            href={`/projects/${item.project.id}/findings/${item.id}`}
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
          >
            <Ico name="pen" size={14} />
            Edit finding
          </Link>
          <Link
            href={`/projects/${item.project.id}`}
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            <Ico name="folder" size={14} />
            View project
          </Link>
        </div>
      </div>
    </>
  );
}

const ITEMS_PER_PAGE = 25;

export function VulnListClient({ findings: initialFindings, projects }: Props) {
  const [findings, setFindings] = useState(initialFindings);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Finding | null>(null);

  // Get unique assignees
  const assignees = Array.from(
    new Map(
      findings
        .filter(f => f.assignee)
        .map(f => [f.assignee!.id, f.assignee!])
    ).values()
  );

  const counts = SEV_ORDER.reduce((acc, s) => {
    acc[s] = findings.filter(f => f.severity === s).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = findings.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = !q || f.title.toLowerCase().includes(q) || f.code.toLowerCase().includes(q) || f.cwe.toLowerCase().includes(q) || f.project.name.toLowerCase().includes(q);
    const matchSev = sevFilter === 'all' || f.severity === sevFilter;
    const matchStatus = statusFilter === 'all' || f.status === statusFilter;
    const matchProject = projectFilter === 'all' || f.project.id === projectFilter;
    const matchAssignee = assigneeFilter === 'all' || f.assignee?.id === assigneeFilter;
    return matchSearch && matchSev && matchStatus && matchProject && matchAssignee;
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedFindings = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [sevFilter, statusFilter, projectFilter, assigneeFilter, search]);

  function handleStatusChange(id: string, status: string) {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status } : f));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
  }

  return (
    <>
      {/* Severity summary strip */}
      <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-1)', display: 'flex', gap: 24, flexShrink: 0 }}>
        {SEV_ORDER.map(s => (
          <button
            key={s}
            onClick={() => setSevFilter(sevFilter === s ? 'all' : s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: sevFilter === s ? `var(--sev-${s}-bg)` : 'transparent',
              border: `1px solid ${sevFilter === s ? 'transparent' : 'transparent'}`,
              borderRadius: 'var(--r-sm)', padding: '4px 10px',
              cursor: 'pointer', transition: 'all 0.1s',
            }}
          >
            <span style={{ fontSize: 20, fontFamily: 'var(--font-serif)', color: `var(--sev-${s})`, lineHeight: 1 }}>{counts[s]}</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: `var(--sev-${s})`, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s}</span>
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length} / {findings.length} findings
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '12px 28px', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-0)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <Ico name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
          <input className="input" style={{ width: '100%', paddingLeft: 32 }} placeholder="Search findings…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ width: 130 }} value={sevFilter} onChange={e => setSevFilter(e.target.value)}>
          <option value="all">All severities</option>
          {SEV_ORDER.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select className="input" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {['open', 'in-progress', 'in-review', 'resolved', 'accepted'].map(s => (
            <option key={s} value={s}>{s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
        <select className="input" style={{ width: 150 }} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="all">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
          <option value="all">All assignees</option>
          {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {(sevFilter !== 'all' || statusFilter !== 'all' || projectFilter !== 'all' || assigneeFilter !== 'all' || search) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setSevFilter('all'); setStatusFilter('all'); setProjectFilter('all'); setAssigneeFilter('all'); }}
          >
            <Ico name="x" size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <table className="tbl">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-0)', zIndex: 10 }}>
            <tr>
              <th style={{ width: 80 }}>ID</th>
              <th>Title</th>
              <th style={{ width: 130 }}>Project</th>
              <th style={{ width: 110 }}>Severity</th>
              <th style={{ width: 60 }}>CVSS</th>
              <th style={{ width: 130 }}>Status</th>
              <th style={{ width: 100 }}>CWE</th>
              <th style={{ width: 110 }}>Assignee</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-3)' }}>
                  <Ico name="search" size={24} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
                  No findings match your filters.
                </td>
              </tr>
            ) : paginatedFindings.map(f => (
              <tr key={f.id} onClick={() => setSelected(f)} style={{ cursor: 'pointer' }}>
                <td><span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{f.code}</span></td>
                <td>
                  <div style={{ fontWeight: 500, color: 'var(--ink-0)', marginBottom: 2 }}>{f.title}</div>
                  {f.summary && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.summary}</div>}
                </td>
                <td>
                  <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 3 }}>
                    {f.project.code}
                  </span>
                </td>
                <td><Sev level={f.severity} size="sm" /></td>
                <td>
                  {f.cvss > 0 ? (
                    <span className="mono" style={{ fontSize: 12, color: f.cvss >= 9 ? 'var(--sev-critical)' : f.cvss >= 7 ? 'var(--sev-high)' : f.cvss >= 4 ? 'var(--sev-medium)' : 'var(--sev-low)' }}>
                      {f.cvss}
                    </span>
                  ) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>
                <td><StatusPill status={f.status} /></td>
                <td>
                  {f.cwe ? <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{f.cwe}</span> : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>
                <td>
                  {f.assignee ? (
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{f.assignee.name.split(' ')[0]}</span>
                  ) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <Link
                    href={`/projects/${f.project.id}/findings/${f.id}`}
                    className="btn btn-ghost btn-sm"
                    style={{ width: 28, padding: 0 }}
                    title="Edit finding"
                  >
                    <Ico name="pen" size={13} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination footer */}
        {filtered.length > 0 && (
          <div style={{ padding: '12px 28px', borderTop: '1px solid var(--line-1)', background: 'var(--bg-0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {filtered.length === 0 ? 'No findings' : `${(currentPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}`}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <Ico name="chevLeft" size={13} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--ink-2)', minWidth: 30, textAlign: 'center' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                <Ico name="chevRight" size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <FindingSlideOver
          item={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  );
}
