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
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
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
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="serif" style={{ margin: 0, fontSize: 30, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1 }}>
            {totalCount === 0 ? 'You\'re all caught up.' : `${totalCount} item${totalCount === 1 ? '' : 's'} need${totalCount === 1 ? 's' : ''} your attention`}
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55 }}>
            Mentions in comments, reports waiting on you to review, and findings assigned to you — all in one place.
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', minWidth: 280 }}>
          <Ico name="search" size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
          <input
            className="input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter by project, finding, sender…"
            style={{ paddingLeft: 34, height: 36, fontSize: 13, width: '100%' }}
          />
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--line-1)',
        overflowX: 'auto', alignItems: 'stretch',
      }}>
        {[
          { key: 'all'      as Tab, label: 'All',      icon: 'inbox',   count: totalCount },
          { key: 'mentions' as Tab, label: 'Mentions', icon: 'message', count: data.mentions.length },
          { key: 'reviews'  as Tab, label: 'Reviews',  icon: 'reports', count: data.reviews.length },
          { key: 'findings' as Tab, label: 'Assigned', icon: 'alert',   count: data.findings.length },
        ].map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                position: 'relative',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 18px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: active ? 'var(--ink-0)' : 'var(--ink-3)',
                fontSize: 13.5, fontWeight: active ? 600 : 500,
                whiteSpace: 'nowrap',
                transition: 'color .15s',
              }}
            >
              <Ico name={t.icon} size={14} />
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  padding: '1px 7px', borderRadius: 100, minWidth: 18, textAlign: 'center',
                  background: active ? 'var(--accent)' : 'var(--bg-3)',
                  color: active ? 'var(--accent-ink, #fff)' : 'var(--ink-2)',
                }}>{t.count}</span>
              )}
              {/* Active indicator stripe */}
              {active && (
                <span style={{
                  position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
                  background: 'var(--accent)', borderRadius: '2px 2px 0 0',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── EMPTY STATE ──────────────────────────────────────────────────── */}
      {totalCount === 0 && (
        <div style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
          <Ico name="inbox" size={44} style={{ display: 'block', margin: '0 auto 18px', opacity: 0.32 }} />
          <div style={{ fontSize: 16, color: 'var(--ink-2)', marginBottom: 6 }}>Inbox zero</div>
          <div style={{ fontSize: 13 }}>Nothing needs your attention right now. Come back later.</div>
        </div>
      )}

      {/* ── MENTIONS ─────────────────────────────────────────────────────── */}
      {showMentions && mentions.length > 0 && (
        <Section title="Mentions" count={mentions.length} icon="message" accent="var(--accent)" subtitle="Comments where you were @-tagged">
          {mentions.map(m => (
            <FullRow
              key={m.id}
              href={`/projects/${m.projectId}/findings/${m.findingId}`}
              leadingAvatar={m.author.name}
              title={<><span style={{ fontWeight: 700 }}>{m.author.name}</span> <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>mentioned you</span></>}
              meta={[m.projectCode, m.findingCode]}
              severity={m.findingSeverity}
              timeIso={m.createdAt}
              body={m.content}
              context={m.findingTitle}
            />
          ))}
        </Section>
      )}

      {/* ── REVIEWS ──────────────────────────────────────────────────────── */}
      {showReviews && reviews.length > 0 && (
        <Section title="Reports awaiting your review" count={reviews.length} icon="reports" accent="rgba(127,179,213,1)" subtitle="You're the assigned reviewer">
          {reviews.map(r => (
            <FullRow
              key={r.id}
              href={r.project ? `/projects/${r.project.id}/report` : '/reports'}
              leadingIcon={{ icon: 'reports', color: 'rgba(127,179,213,1)' }}
              title={<>{r.project?.name || 'Report'} <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontWeight: 400, marginLeft: 6 }}>{r.version}</span></>}
              meta={[r.code, r.project?.code]}
              timeIso={r.createdAt}
              body={r.author?.name ? `Submitted for review by ${r.author.name}` : 'Submitted for review'}
              cta="Open to review"
            />
          ))}
        </Section>
      )}

      {/* ── FINDINGS ─────────────────────────────────────────────────────── */}
      {showFindings && findings.length > 0 && (
        <Section title="Findings assigned to you" count={findings.length} icon="alert" accent="rgba(245,165,36,1)" subtitle="Still open">
          {findings.map(f => (
            <FullRow
              key={f.id}
              href={f.project ? `/projects/${f.project.id}/findings/${f.id}` : '/library'}
              leadingIcon={{ icon: 'alert', color: 'rgba(245,165,36,1)' }}
              title={f.title}
              meta={[f.code, f.project?.code, f.cvss > 0 ? `CVSS ${f.cvss.toFixed(1)}` : undefined]}
              severity={f.severity}
              status={f.status}
              timeIso={f.createdAt}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────
function Section({ title, subtitle, count, icon, accent, children }: {
  title: string; subtitle?: string; count: number; icon: string; accent: string; children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        paddingLeft: 12, borderLeft: `3px solid ${accent}`,
      }}>
        <Ico name={icon} size={15} style={{ color: accent }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-0)', letterSpacing: '-0.005em' }}>
          {title}
        </h2>
        <span style={{
          fontSize: 10.5, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 100,
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          color: accent, fontWeight: 700,
        }}>{count}</span>
        {subtitle && (
          <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}>
            {subtitle}
          </span>
        )}
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

// ─── Single inbox row — wide, prominent, accent-bar on the left ────────────
function FullRow({
  href, leadingAvatar, leadingIcon, title, meta, severity, status, timeIso, body, context, cta,
}: {
  href: string;
  leadingAvatar?: string;
  leadingIcon?: { icon: string; color: string };
  title: React.ReactNode;
  meta?: (string | undefined)[];
  severity?: string;
  status?: string;
  timeIso: string;
  body?: string;
  context?: string;
  cta?: string;
}) {
  const sevAccent: Record<string, string> = {
    critical: 'var(--sev-critical)', high: 'var(--sev-high)',
    medium: 'var(--sev-medium)', low: 'var(--sev-low)', info: 'var(--sev-info)',
  };
  const leftAccent = severity ? sevAccent[severity] : (leadingIcon?.color ?? 'var(--accent)');

  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: '18px 22px 18px 22px',
        background: 'var(--bg-1)',
        border: '1px solid var(--line-1)',
        borderLeft: `3px solid ${leftAccent}`,
        borderRadius: 'var(--r-md)',
        color: 'inherit', textDecoration: 'none',
        transition: 'background .15s, border-color .15s, transform .12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-2)';
        e.currentTarget.style.borderColor = 'var(--line-2)';
        e.currentTarget.style.borderLeftColor = leftAccent;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg-1)';
        e.currentTarget.style.borderColor = 'var(--line-1)';
        e.currentTarget.style.borderLeftColor = leftAccent;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>

        {/* Leading visual: avatar or icon */}
        {leadingAvatar ? (
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            <Avatar name={leadingAvatar} size={36} />
          </div>
        ) : leadingIcon ? (
          <div style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: 8,
            background: `color-mix(in srgb, ${leadingIcon.color} 14%, transparent)`,
            color: leadingIcon.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 2,
          }}>
            <Ico name={leadingIcon.icon} size={16} />
          </div>
        ) : null}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, color: 'var(--ink-0)', lineHeight: 1.35, flex: 1, minWidth: 0 }}>
              {title}
            </div>
            <span style={{
              fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {timeAgo(timeIso)}
            </span>
          </div>

          {/* Body (quote, description, etc.) */}
          {body && (
            <div style={{
              fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {body}
            </div>
          )}

          {/* Context line (e.g. parent finding title) */}
          {context && (
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4, fontStyle: 'italic' }}>
              ↳ {context}
            </div>
          )}

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap', marginTop: 2 }}>
            {severity && <Sev level={severity as 'critical' | 'high' | 'medium' | 'low' | 'info'} size="sm" />}
            {status && (
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '1px 7px', borderRadius: 100, color: 'var(--ink-2)',
                background: 'var(--bg-3)', border: '1px solid var(--line-1)',
              }}>
                {status.replace(/[_-]/g, ' ')}
              </span>
            )}
            {meta?.filter(Boolean).map((m, i) => (
              <span key={i} style={{ fontFamily: 'var(--font-mono)' }}>
                {i > 0 && <span style={{ color: 'var(--line-2)', marginRight: 8 }}>·</span>}
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* CTA pill (right side) */}
        {cta && (
          <div style={{
            flexShrink: 0, alignSelf: 'center',
            padding: '6px 12px', borderRadius: 100, fontSize: 11.5, fontFamily: 'var(--font-mono)',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: 'var(--accent)', whiteSpace: 'nowrap', fontWeight: 600,
          }}>{cta} →</div>
        )}
      </div>
    </Link>
  );
}
