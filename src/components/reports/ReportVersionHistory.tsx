'use client';

import React, { useState, useEffect } from 'react';

interface Version {
  id: string;
  versionNumber: number;
  status: string;
  approver?: { name: string } | null;
  rejectionReason?: string;
  createdAt: string;
}

interface ReportVersionHistoryProps {
  reportId: string;
}

const STATUS_COLOR: Record<string, string> = {
  approved:  'var(--status-resolved)',
  rejected:  'var(--sev-critical)',
  'in-review': 'var(--warn)',
  draft:     'var(--ink-3)',
};

export function ReportVersionHistory({ reportId }: ReportVersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports/${reportId}/versions`)
      .then(r => r.json())
      .then(d => setVersions(d.versions ?? []))
      .catch(() => setError('Could not load versions'))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading history…</p>;
  if (error)   return <p style={{ fontSize: 13, color: 'var(--sev-critical)' }}>{error}</p>;
  if (!versions.length) return <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No version snapshots recorded yet. Snapshots are created when a report is submitted, approved or rejected.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {versions.map((v, i) => {
        const color = STATUS_COLOR[v.status] ?? 'var(--ink-3)';
        return (
          <div key={v.id} style={{ display: 'flex', gap: 12 }}>
            {/* Timeline spine */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, marginTop: 4 }} />
              {i < versions.length - 1 && (
                <div style={{ flex: 1, width: 1, background: 'var(--line-1)', marginTop: 3 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: i < versions.length - 1 ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)' }}>
                  v{v.versionNumber}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color, textTransform: 'capitalize',
                  background: `${color}18`, padding: '1px 7px', borderRadius: 100,
                }}>
                  {v.status}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {new Date(v.createdAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </div>
              {v.approver && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>
                  Approved by <strong>{v.approver.name}</strong>
                </div>
              )}
              {v.rejectionReason && (
                <div style={{ fontSize: 11.5, color: 'var(--sev-critical)', marginTop: 2, fontStyle: 'italic' }}>
                  "{v.rejectionReason}"
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
