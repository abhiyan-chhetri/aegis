'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { StatusPill } from '@/components/ui/SevBadge';

type Engagement = {
  id: string;
  name: string;
  code: string;
  status: string;
  targetCode: string;
  engagementYear: string;
  startDate: string;
  endDate: string;
  findingCount: number;
  resolvedCount: number;
};

export function EngagementYearSelector({ engagements, slug }: {
  engagements: Engagement[];
  slug: string;
}) {
  const target = engagements[0];
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverNew, setHoverNew] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        title={target.name}
        breadcrumb={['Projects', target.name]}
        subtitle={slug}
        actions={
          <Link href={`/projects/${engagements[0].id}/findings/new`} className="btn btn-primary btn-sm">
            <Ico name="plus" size={13} /> Add finding
          </Link>
        }
      />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-0)', padding: '40px 28px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {slug}
            </div>
            <h1 className="serif" style={{ fontSize: 26, fontWeight: 400, color: 'var(--ink-0)', margin: 0, marginBottom: 8 }}>
              {target.name}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
              {engagements.length} engagement{engagements.length !== 1 ? 's' : ''} found · select a year to open findings
            </p>
          </div>

          {/* Engagement cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {engagements.map((eng, i) => {
              const resRate = eng.findingCount > 0 ? Math.round((eng.resolvedCount / eng.findingCount) * 100) : 0;
              const isLatest = i === 0;
              const isHovered = hoveredId === eng.id;
              return (
                <Link
                  key={eng.id}
                  href={`/projects/${slug}/${eng.id}`}
                  style={{ textDecoration: 'none', display: 'flex' }}
                >
                  <div
                    onMouseEnter={() => setHoveredId(eng.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      background: 'var(--bg-1)',
                      border: `1px solid ${isLatest || isHovered ? 'var(--accent)' : 'var(--line-1)'}`,
                      borderRadius: 'var(--r-md)', padding: '20px 20px 16px',
                      cursor: 'pointer', transition: 'all 0.15s',
                      boxShadow: isLatest ? '0 0 0 1px var(--accent)' : 'none',
                      flex: 1,
                    }}
                  >
                    {/* Year badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{
                        fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        color: isLatest ? 'var(--accent)' : 'var(--ink-0)',
                        letterSpacing: '-0.04em', lineHeight: 1,
                      }}>
                        {eng.engagementYear || eng.startDate?.slice(0, 4) || '—'}
                      </span>
                      {isLatest && (
                        <span style={{
                          fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em',
                          color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          padding: '2px 8px', borderRadius: 100,
                        }}>Latest</span>
                      )}
                    </div>

                    {/* Status */}
                    <div style={{ marginBottom: 12 }}>
                      <StatusPill status={eng.status} />
                    </div>

                    {/* Finding stats */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink-0)', lineHeight: 1 }}>
                          {eng.findingCount}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>findings</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: resRate >= 70 ? 'var(--status-resolved)' : resRate >= 40 ? 'var(--sev-medium)' : 'var(--ink-0)', lineHeight: 1 }}>
                          {eng.findingCount > 0 ? `${resRate}%` : '—'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>resolved</div>
                      </div>
                    </div>

                    {/* Resolution bar */}
                    {eng.findingCount > 0 && (
                      <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                        <div style={{ width: `${resRate}%`, height: '100%', background: resRate >= 70 ? 'var(--status-resolved)' : resRate >= 40 ? 'var(--sev-medium)' : 'var(--sev-high)', borderRadius: 100 }} />
                      </div>
                    )}

                    {/* Period */}
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10 }}>
                      {eng.startDate} — {eng.endDate}
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* + New engagement card */}
            <Link
              href={`/projects/new?targetCode=${encodeURIComponent(slug)}&previousEngagementId=${encodeURIComponent(engagements[0].id)}&from=${encodeURIComponent(engagements[0].name)}`}
              style={{ textDecoration: 'none' }}
            >
              <div
                onMouseEnter={() => setHoverNew(true)}
                onMouseLeave={() => setHoverNew(false)}
                style={{
                  background: hoverNew ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent',
                  border: `1.5px dashed ${hoverNew ? 'var(--accent)' : 'var(--line-2)'}`,
                  borderRadius: 'var(--r-md)', padding: '20px 20px 16px',
                  cursor: 'pointer', transition: 'all 0.15s', minHeight: 150,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Ico name="plus" size={20} style={{ color: 'var(--ink-3)' }} />
                <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>New engagement</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
