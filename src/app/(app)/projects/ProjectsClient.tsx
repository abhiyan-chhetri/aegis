'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Ico } from '@/components/chrome/icons';
import { SevCounts, StatusPill } from '@/components/ui/SevBadge';

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  engagement: string;
  status: string;
  progress: number;
  targetCode?: string;
  slug?: string;
  engagementCount?: number;
  lead: { id: string; name: string; initials: string };
  counts: Record<string, number>;
};

type StatusStat = { label: string; count: number; color: string };

type Props = {
  projects: ProjectRow[];
  statusStats: StatusStat[];
};

export function ProjectsClient({ projects, statusStats }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);

  async function handleDeleteProject(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its findings and reports permanently? This cannot be undone.`)) return;
    setDeletingProject(id);
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeletingProject(null);
    }
  }

  const filtered = useMemo(() => {
    let result = projects;
    if (statusFilter) result = result.filter(p => p.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.engagement.toLowerCase().includes(q) ||
        p.lead.name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [projects, query, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Stat bar */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-1)', padding: '0 28px', overflowX: 'auto',
      }} className="thin-scroll">
        <button
          onClick={() => setStatusFilter(null)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '14px 16px', borderBottom: `2px solid ${!statusFilter ? 'var(--ink-0)' : 'transparent'}`,
            color: !statusFilter ? 'var(--ink-0)' : 'var(--ink-2)',
            fontSize: 13, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 8,
            transition: 'color 0.1s', whiteSpace: 'nowrap', marginBottom: -1,
          }}
        >
          All projects
          <span style={{
            background: 'var(--bg-3)', borderRadius: 100, fontSize: 10,
            fontFamily: 'var(--font-mono)', padding: '1px 7px', color: 'var(--ink-2)',
            border: '1px solid var(--line-1)',
          }}>
            {projects.length}
          </span>
        </button>
        {statusStats.map(s => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(statusFilter === s.label ? null : s.label)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '14px 16px', borderBottom: `2px solid ${statusFilter === s.label ? s.color : 'transparent'}`,
              color: statusFilter === s.label ? 'var(--ink-0)' : 'var(--ink-2)',
              fontSize: 13, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'color 0.1s', whiteSpace: 'nowrap', marginBottom: -1,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
            {s.label}
            <span style={{
              background: 'var(--bg-3)', borderRadius: 100, fontSize: 10,
              fontFamily: 'var(--font-mono)', padding: '1px 7px', color: 'var(--ink-2)',
              border: '1px solid var(--line-1)',
            }}>
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 28px', borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-0)',
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Ico name="search" size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--ink-3)', pointerEvents: 'none',
          }} />
          <input
            className="input"
            type="text"
            placeholder="Search projects, codes, leads…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: 34 }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/projects/new" className="btn btn-primary btn-sm">
          <Ico name="plus" size={13} />
          New project
        </Link>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 20px', color: 'var(--ink-3)' }}>
            <Ico name="projects" size={28} />
            <div style={{ fontSize: 14 }}>{query ? 'No projects match your search' : 'No projects yet'}</div>
            {!query && (
              <Link href="/projects/new" className="btn btn-sm">
                <Ico name="plus" size={12} />
                Create your first project
              </Link>
            )}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Code</th>
                <th>Engagement</th>
                <th>Type</th>
                <th>Lead</th>
                <th>Findings</th>
                <th style={{ width: 140 }}>Progress</th>
                <th>Status</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>
                      {p.code}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Link href={`/projects/${p.slug || p.targetCode || p.code || p.id}`} style={{ color: 'var(--ink-0)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
                        {p.name}
                      </Link>
                      {(p.engagementCount ?? 1) > 1 && (
                        <span title={`${p.engagementCount} engagements`} style={{
                          fontSize: 10, fontFamily: 'var(--font-mono)',
                          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                          borderRadius: 100, padding: '1px 7px', whiteSpace: 'nowrap',
                        }}>
                          {p.engagementCount} engagements
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{p.engagement}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={p.lead.name} size={22} />
                      <span style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{p.lead.name}</span>
                    </div>
                  </td>
                  <td>
                    <SevCounts counts={p.counts} compact />
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{
                          width: `${p.progress}%`,
                          background: p.progress >= 80 ? 'var(--status-resolved)' : p.progress >= 40 ? 'var(--ink-1)' : 'var(--sev-high)',
                        }} />
                      </div>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{p.progress}%</span>
                    </div>
                  </td>
                  <td>
                    <StatusPill status={p.status} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <Link href={`/projects/${p.slug || p.targetCode || p.code || p.id}`} className="btn btn-ghost btn-sm" style={{ padding: '0 8px' }} title="View project">
                        <Ico name="chevRight" size={13} />
                      </Link>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0 8px', color: deletingProject === p.id ? 'var(--sev-critical)' : 'var(--ink-3)' }}
                        title="Delete project"
                        disabled={deletingProject === p.id}
                        onClick={() => handleDeleteProject(p.id, p.name)}
                      >
                        <Ico name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && (
        <div style={{ padding: '12px 28px', borderTop: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {filtered.length === projects.length
              ? `${projects.length} project${projects.length !== 1 ? 's' : ''}`
              : `${filtered.length} of ${projects.length} projects`}
          </span>
        </div>
      )}
    </div>
  );
}
