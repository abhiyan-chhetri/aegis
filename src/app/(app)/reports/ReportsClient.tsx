'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ico, Avatar } from '@/components/chrome/icons';
import { StatusPill } from '@/components/ui/SevBadge';
import { ReportVersionHistory } from '@/components/reports/ReportVersionHistory';

type Report = {
  id: string;
  code: string;
  version: string;
  status: string;
  pages: number;
  size: string;
  createdAt: Date;
  reviewComment?: string;
  reviewerId?: string | null;
  reviewerName?: string | null;
  project: { id: string; code: string; name: string };
  author: { id: string; name: string; initials: string };
  template: { id: string; name: string } | null;
  templateName: string;
};

type Props = {
  reports: Report[];
  currentUserId: string;
};

const STATUS_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'approved',  label: 'Final' },
  { key: 'in-review', label: 'In Review' },
  { key: 'rejected',  label: 'Rejected' },
  { key: 'draft',     label: 'Draft' },
];

function PaperThumbnail({ status }: { status: string }) {
  const barColor =
    status === 'approved' ? 'var(--status-resolved)' :
    status === 'in-review' ? 'var(--sev-low)' :
    status === 'rejected' ? 'var(--sev-critical)' :
    'var(--ink-3)';

  return (
    <div style={{
      width: 42, height: 54, flexShrink: 0,
      background: 'var(--paper)',
      borderRadius: 3,
      border: '1px solid var(--paper-rule)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <div style={{ flex: 1, padding: '5px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[80, 60, 75, 50, 65, 55].map((w, i) => (
          <div key={i} style={{
            height: 2, borderRadius: 1,
            width: `${w}%`,
            background: 'var(--paper-rule)',
          }} />
        ))}
      </div>
      <div style={{ height: 3, background: barColor, opacity: 0.8 }} />
    </div>
  );
}

function ReportRow({
  report: initialReport,
  onStatusChange,
}: {
  report: Report;
  onStatusChange: (id: string, update: Partial<Report>) => void;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [showHistory, setShowHistory] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');

  const date = new Date(report.createdAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const templateLabel = report.template?.name || report.templateName || '—';

  async function doAction(action: 'approve' | 'reject') {
    setActing(true);
    setActionError('');
    try {
      const body: Record<string, string> = { action };
      if (action === 'reject') body.comment = rejectComment;

      const res = await fetch(`/api/reports/${report.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Action failed');
        return;
      }
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const updated = { ...report, status: newStatus, reviewComment: rejectComment };
      setReport(updated);
      onStatusChange(report.id, updated);
      setShowRejectForm(false);
      setRejectComment('');
    } catch {
      setActionError('Network error');
    } finally {
      setActing(false);
    }
  }

  return (
    <div style={{
      borderBottom: '1px solid var(--line-1)',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '14px 28px',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <PaperThumbnail status={report.status} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{report.code}</span>
            <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>·</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {report.project.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Avatar name={report.author.name} id={report.author.initials} size={18} />
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{report.author.name}</span>
            <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{templateLabel}</span>
            {report.reviewerName && report.status === 'in-review' && (
              <>
                <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>·</span>
                <span style={{ fontSize: 12, color: 'var(--sev-low)' }}>
                  🔍 Reviewer: {report.reviewerName}
                </span>
              </>
            )}
          </div>
          {report.status === 'rejected' && report.reviewComment && (
            <div style={{ fontSize: 11, color: 'var(--sev-critical)', marginTop: 4, fontStyle: 'italic' }}>
              ❌ Rejected: &ldquo;{report.reviewComment}&rdquo;
            </div>
          )}
          {actionError && (
            <div style={{ fontSize: 11, color: 'var(--sev-critical)', marginTop: 4 }}>⚠️ {actionError}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          <div style={{ textAlign: 'center', minWidth: 60 }}>
            <StatusPill status={report.status} />
          </div>

          <div style={{ textAlign: 'right', minWidth: 48 }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-0)', fontWeight: 500 }}>{report.version}</span>
          </div>

          <div style={{ textAlign: 'right', minWidth: 72 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{report.pages}p</div>
            {report.size && <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{report.size}</div>}
          </div>

          <div style={{ textAlign: 'right', minWidth: 100 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-1)' }}>{dateStr}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{timeStr}</div>
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {/* Approve / Reject inline actions for in-review reports */}
            {report.status === 'in-review' && (
              <>
                <button
                  className="btn btn-sm"
                  style={{
                    background: 'rgba(143,201,122,0.15)',
                    border: '1px solid rgba(143,201,122,0.4)',
                    color: 'var(--status-resolved)',
                    fontWeight: 600,
                    fontSize: 12,
                    gap: 4,
                  }}
                  disabled={acting}
                  onClick={() => doAction('approve')}
                  title="Approve report"
                >
                  ✅ Approve
                </button>
                <button
                  className="btn btn-sm"
                  style={{
                    background: showRejectForm ? 'rgba(255,82,82,0.15)' : 'transparent',
                    border: '1px solid rgba(255,82,82,0.35)',
                    color: 'var(--sev-critical)',
                    fontWeight: 600,
                    fontSize: 12,
                    gap: 4,
                  }}
                  disabled={acting}
                  onClick={() => setShowRejectForm(v => !v)}
                  title="Reject report"
                >
                  ❌ Reject
                </button>
              </>
            )}

            <button
              className="btn btn-ghost btn-sm"
              style={{ width: 28, padding: 0 }}
              title="Preview"
              onClick={() => router.push(`/projects/${report.project.id}/report`)}
            >
              <Ico name="eye" size={13} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: 28, padding: 0 }}
              title="Download PDF"
              onClick={() => {
                const win = window.open(`/projects/${report.project.id}/report`, '_blank');
                if (win) setTimeout(() => win.print(), 1500);
              }}
            >
              <Ico name="download" size={13} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: 28, padding: 0 }}
              title="Version History"
              onClick={() => setShowHistory(true)}
            >
              <Ico name="clock" size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Inline reject form */}
      {showRejectForm && (
        <div style={{
          padding: '0 28px 14px calc(28px + 42px + 16px)',
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <textarea
            className="input"
            placeholder="Reason for rejection (optional)…"
            value={rejectComment}
            onChange={e => setRejectComment(e.target.value)}
            style={{ flex: 1, minHeight: 64, resize: 'vertical', fontSize: 13 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className="btn btn-sm"
              style={{
                background: 'rgba(255,82,82,0.15)',
                border: '1px solid rgba(255,82,82,0.4)',
                color: 'var(--sev-critical)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
              disabled={acting}
              onClick={() => doAction('reject')}
            >
              {acting ? 'Rejecting…' : '❌ Confirm Reject'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setShowRejectForm(false); setRejectComment(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-0)',
              borderRadius: 8,
              padding: '2rem',
              maxWidth: 500,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                Version History — {report.code}
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                ×
              </button>
            </div>
            <ReportVersionHistory reportId={report.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportsClient({ reports: initialReports, currentUserId }: Props) {
  const [reports, setReports] = useState(initialReports);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  function handleStatusChange(id: string, update: Partial<Report>) {
    setReports(prev => prev.map(r => r.id === id ? { ...r, ...update } : r));
  }

  const counts = STATUS_TABS.reduce<Record<string, number>>((acc, tab) => {
    acc[tab.key] = tab.key === 'all'
      ? reports.length
      : reports.filter(r => (r.status ?? 'draft') === tab.key).length;
    return acc;
  }, {});

  const filtered = reports.filter(r => {
    const status = r.status ?? 'draft';
    const matchTab = activeTab === 'all' || status === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.code.toLowerCase().includes(q)
      || r.project.name.toLowerCase().includes(q)
      || r.author.name.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  // suppress unused var warning
  void currentUserId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Tab bar + search */}
      <div style={{
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-1)',
        padding: '0 28px',
        gap: 0,
      }}>
        <div className="tab-bar" style={{ padding: 0, border: 'none', flex: 1 }}>
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              className={`tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="badge" style={{ marginLeft: 4, opacity: counts[tab.key] === 0 ? 0.35 : 1 }}>
                {counts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Ico name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ width: 220, paddingLeft: 32 }}
            placeholder="Search reports…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '8px 28px 8px calc(28px + 42px + 16px)',
        borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-0)',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-3)' }}>
            Report
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          {['Status', 'Version', 'Pages', 'Date', ''].map((h, i) => (
            <div key={i} style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              letterSpacing: '0.1em', color: 'var(--ink-3)',
              minWidth: h === 'Status' ? 60 : h === 'Version' ? 48 : h === 'Pages' ? 72 : h === 'Date' ? 100 : 92,
              textAlign: 'right',
            }}>
              {h}
            </div>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink-3)' }}>
            <Ico name="file" size={32} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.2 }} />
            No reports match your filters.
          </div>
        ) : filtered.map(r => (
          <ReportRow key={r.id} report={r} onStatusChange={handleStatusChange} />
        ))}
      </div>
    </div>
  );
}
