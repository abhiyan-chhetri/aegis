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
  project: { id: string; code: string; name: string };
  author: { id: string; name: string; initials: string };
  template: { id: string; name: string } | null;
  templateName: string;
};

type Props = {
  reports: Report[];
};

const STATUS_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'approved',  label: 'Final' },
  { key: 'in-review', label: 'In review' },
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
      {/* fake lines */}
      <div style={{ flex: 1, padding: '5px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[80, 60, 75, 50, 65, 55].map((w, i) => (
          <div key={i} style={{
            height: 2, borderRadius: 1,
            width: `${w}%`,
            background: 'var(--paper-rule)',
          }} />
        ))}
      </div>
      {/* severity bar */}
      <div style={{ height: 3, background: barColor, opacity: 0.8 }} />
    </div>
  );
}

function ReportRow({ report }: { report: Report }) {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const date = new Date(report.createdAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const templateLabel = report.template?.name || report.templateName || '—';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 28px',
      borderBottom: '1px solid var(--line-1)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={report.author.name} id={report.author.initials} size={18} />
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{report.author.name}</span>
          <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{templateLabel}</span>
        </div>
        {report.status === 'rejected' && report.reviewComment && (
          <div style={{ fontSize: 11, color: 'var(--sev-critical)', marginTop: 4, fontStyle: 'italic' }}>
            Rejected: &ldquo;{report.reviewComment}&rdquo;
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <StatusPill status={report.status} />
        </div>

        <div style={{ textAlign: 'right', minWidth: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-0)', fontWeight: 500 }}>{report.version}</span>
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 72 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{report.pages}p</div>
          {report.size && <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{report.size}</div>}
        </div>

        <div style={{ textAlign: 'right', minWidth: 100 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-1)' }}>{dateStr}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{timeStr}</div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
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
          <button className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }} title="More">
            <Ico name="more" size={13} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-0)',
              borderRadius: '8px',
              padding: '2rem',
              maxWidth: '500px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                Version History - {report.code}
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
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

export function ReportsClient({ reports }: Props) {
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  const counts = STATUS_TABS.reduce<Record<string, number>>((acc, tab) => {
    acc[tab.key] = tab.key === 'all'
      ? reports.length
      : reports.filter(r => r.status === tab.key).length;
    return acc;
  }, {});

  const filtered = reports.filter(r => {
    const matchTab = activeTab === 'all' || r.status === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.code.toLowerCase().includes(q)
      || r.project.name.toLowerCase().includes(q)
      || r.author.name.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

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
              <span className="badge" style={{ marginLeft: 2 }}>{counts[tab.key]}</span>
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

      {/* List */}
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Column header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '8px 28px 8px calc(28px + 42px + 16px)',
          borderBottom: '1px solid var(--line-1)',
          background: 'var(--bg-0)',
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-3)' }}>
              Report
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
            {['Status', 'Version', 'Pages', 'Date'].map(h => (
              <div key={h} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-3)', minWidth: h === 'Status' ? 60 : h === 'Version' ? 48 : h === 'Pages' ? 72 : 100, textAlign: 'right' }}>
                {h}
              </div>
            ))}
            <div style={{ width: 92 }} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--ink-3)' }}>
            No reports match your filters.
          </div>
        ) : filtered.map(r => (
          <ReportRow key={r.id} report={r} />
        ))}
      </div>
    </div>
  );
}
