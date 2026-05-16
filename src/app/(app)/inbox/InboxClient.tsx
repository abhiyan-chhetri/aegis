'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Ico, Avatar } from '@/components/chrome/icons';
import { Sev } from '@/components/ui/SevBadge';

interface MentionItem {
  id: string;
  content: string;
  createdAt: string;
  findingId: string;
  findingTitle: string;
  findingCode: string;
  findingSeverity: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  author: { id: string; name: string; initials: string };
}
interface ReviewItem {
  id: string;
  code: string;
  version: string;
  createdAt: string;
  project: { id: string; name: string; code: string } | null;
  author: { id: string; name: string; initials: string } | null;
}
interface FindingItem {
  id: string;
  code: string;
  title: string;
  severity: string;
  status: string;
  cvss: number;
  createdAt: string;
  project: { id: string; name: string; code: string } | null;
}
interface InboxData { mentions: MentionItem[]; reviews: ReviewItem[]; findings: FindingItem[]; }

type Tab = 'all' | 'mentions' | 'reviews' | 'findings';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function InboxClient({ data }: { data: InboxData }) {
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');

  const totalCount = data.mentions.length + data.reviews.length + data.findings.length;

  const matches = (text: string) =>
    !q.trim() || q.toLowerCase().split(/\s+/).every(t => text.toLowerCase().includes(t));

  const mentions = data.mentions.filter(m =>
    matches(`${m.content} ${m.findingTitle} ${m.findingCode} ${m.projectName} ${m.projectCode} ${m.author.name}`));
  const reviews  = data.reviews.filter(r =>
    matches(`${r.code} ${r.version} ${r.project?.name ?? ''} ${r.project?.code ?? ''} ${r.author?.name ?? ''}`));
  const findings = data.findings.filter(f =>
    matches(`${f.code} ${f.title} ${f.severity} ${f.project?.name ?? ''} ${f.project?.code ?? ''}`));

  const showMentions = tab === 'all' || tab === 'mentions';
  const showReviews  = tab === 'all' || tab === 'reviews';
  const showFindings = tab === 'all' || tab === 'findings';

  return (
    <div style={{ maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', alignSelf: 'flex-start' }}>
        {[
          { key: 'all' as Tab,      label: 'All',        count: totalCount },
          { key: 'mentions' as Tab, label: 'Mentions',   count: data.mentions.length },
          { key: 'reviews' as Tab,  label: 'Reviews',    count: data.reviews.length },
          { key: 'findings' as Tab, label: 'Assigned',   count: data.findings.length },
        ].map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 'var(--r-xs)',
                background: active ? 'var(--bg-1)' : 'transparent',
                border: '1px solid', borderColor: active ? 'var(--line-2)' : 'transparent',
                color: active ? 'var(--ink-0)' : 'var(--ink-2)',
                fontSize: 12, fontFamily: 'var(--font-sans)', cursor: 'pointer',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {t.label}
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                padding: '0px 6px', borderRadius: 100, minWidth: 18, textAlign: 'center',
                background: active && t.count > 0 ? 'var(--accent)' : 'var(--bg-3)',
                color: active && t.count > 0 ? 'var(--accent-ink, #fff)' : 'var(--ink-3)',
              }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 460 }}>
        <Ico name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
        <input
          className="input"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter by project, finding, sender…"
          style={{ paddingLeft: 30, height: 32, fontSize: 12.5, width: '100%' }}
        />
      </div>

      {/* Empty state */}
      {totalCount === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
          <Ico name="inbox" size={32} style={{ display: 'block', margin: '0 auto 14px', opacity: 0.4 }} />
          <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 4 }}>Your inbox is empty</div>
          <div style={{ fontSize: 12 }}>You&rsquo;re all caught up.</div>
        </div>
      )}

      {/* Mentions */}
      {showMentions && mentions.length > 0 && (
        <Section icon="message" title="Mentions" count={mentions.length}>
          {mentions.map(m => (
            <Link
              key={m.id}
              href={`/projects/${m.projectId}/findings/${m.findingId}`}
              style={inboxRowStyle}
            >
              <Avatar name={m.author.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)' }}>{m.author.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>mentioned you</span>
                  <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{timeAgo(m.createdAt)}</span>
                </div>
                <div style={{
                  fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5, marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                }}>
                  {m.content}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                  <span>{m.projectCode}</span>
                  <span>·</span>
                  <span style={{ color: 'var(--ink-2)' }}>{m.findingCode}</span>
                  <span>·</span>
                  <Sev level={m.findingSeverity as 'critical' | 'high' | 'medium' | 'low' | 'info'} size="sm" />
                  <span style={{ color: 'var(--ink-2)' }}>{m.findingTitle}</span>
                </div>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {/* Reviews */}
      {showReviews && reviews.length > 0 && (
        <Section icon="reports" title="Reports awaiting your review" count={reviews.length} accent="rgba(127,179,213,0.6)">
          {reviews.map(r => (
            <Link
              key={r.id}
              href={r.project ? `/projects/${r.project.id}/report` : '/reports'}
              style={inboxRowStyle}
            >
              <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(127,179,213,0.14)', color: 'rgba(127,179,213,1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ico name="reports" size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)' }}>
                    {r.project?.name || 'Report'} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontWeight: 400 }}>{r.version}</span>
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{timeAgo(r.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 3 }}>
                  Submitted for review by <b>{r.author?.name ?? 'unknown'}</b>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                  {r.code} {r.project?.code ? `· ${r.project.code}` : ''}
                </div>
              </div>
              <div style={{
                padding: '3px 9px', borderRadius: 100, fontSize: 10, fontFamily: 'var(--font-mono)',
                background: 'rgba(127,179,213,0.14)', color: 'rgba(127,179,213,1)', whiteSpace: 'nowrap',
              }}>Open to review →</div>
            </Link>
          ))}
        </Section>
      )}

      {/* Findings */}
      {showFindings && findings.length > 0 && (
        <Section icon="alert" title="Findings assigned to you" count={findings.length} accent="rgba(245,165,36,0.5)">
          {findings.map(f => (
            <Link
              key={f.id}
              href={f.project ? `/projects/${f.project.id}/findings/${f.id}` : '/library'}
              style={inboxRowStyle}
            >
              <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-3)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ico name="alert" size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{timeAgo(f.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                  <Sev level={f.severity as 'critical' | 'high' | 'medium' | 'low' | 'info'} size="sm" />
                  <span>{f.code}</span>
                  <span>·</span>
                  <span>{f.project?.code ?? ''}</span>
                  {f.cvss > 0 && <><span>·</span><span>CVSS {f.cvss.toFixed(1)}</span></>}
                  <span>·</span>
                  <span style={{ color: 'var(--ink-2)' }}>{f.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function Section({ icon, title, count, children, accent }: { icon: string; title: string; count: number; children: React.ReactNode; accent?: string }) {
  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px', borderBottom: '1px solid var(--line-1)',
        background: accent ? `linear-gradient(90deg, ${accent}1a 0%, transparent 70%)` : 'var(--bg-2)',
      }}>
        <Ico name={icon} size={14} style={{ color: accent || 'var(--ink-2)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        <span style={{
          fontSize: 10, padding: '1px 7px', borderRadius: 100, fontFamily: 'var(--font-mono)',
          background: 'var(--bg-3)', color: 'var(--ink-2)',
        }}>{count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

const inboxRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12,
  padding: '12px 16px', borderBottom: '1px solid var(--line-1)',
  textDecoration: 'none', color: 'inherit',
  transition: 'background .12s',
};
