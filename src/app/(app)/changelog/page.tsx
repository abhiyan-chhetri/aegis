import { connection } from 'next/server';
import React from 'react';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';

// ─── Types ───────────────────────────────────────────────────────────────────

type ChangeType = 'new' | 'improved' | 'fixed' | 'security' | 'breaking';

interface Change {
  type: ChangeType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: Change[];
  highlight?: boolean;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const RELEASES: Release[] = [
  {
    version: '1.4.0',
    date: '2026-05-11',
    title: 'Live Collaboration + Asset Owners',
    summary: 'Real-time multi-user editing with presence indicators, collaborative notes with conflict resolution, and full asset owner tracking across findings and projects.',
    highlight: true,
    changes: [
      { type: 'new', text: 'Live presence indicators — see who else is viewing the same finding or notes in real time (Google Docs-style stacked avatars)' },
      { type: 'new', text: 'Collaborative notes with auto-save (1.2 s debounce), 20 s background sync, and conflict resolution banner ("Use theirs / Keep mine") when two people edit simultaneously' },
      { type: 'new', text: 'Asset Owner field on every finding — tracks which team or system owns the vulnerable component' },
      { type: 'new', text: 'Asset Owners tab per project — KPI cards (most-exposed owner, avg resolution rate, unresolved count) plus per-owner severity breakdown table with inline finding expansion' },
      { type: 'new', text: 'Asset owner autocomplete — suggests existing owner names from across all projects when creating or editing findings' },
      { type: 'new', text: 'Asset owner chip input on new-project form — add/remove owners as chips with datalist suggestions' },
      { type: 'improved', text: 'New findings are auto-assigned to the creator — no more leaving assignee blank by accident' },
      { type: 'improved', text: 'Library page: assignee filter dropdown populated dynamically from findings data' },
      { type: 'improved', text: 'Library page: pagination (25 per page) with page counter and prev/next controls' },
      { type: 'fixed', text: 'Docker build no longer fails when the database is unavailable at build time' },
      { type: 'fixed', text: 'Schema migrations now run automatically on server startup (instrumentation hook) — no manual psql commands needed after deploy' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05-11',
    title: 'Portfolio MBR Dashboard + Collab Notes',
    summary: 'Manager-focused Monthly Business Review metrics on the Portfolio page and the first version of per-project collaborative notes sent to AI for context.',
    changes: [
      { type: 'new', text: 'Portfolio page rebuilt as a manager MBR dashboard: resolution rate, average CVSS, mean time to resolve, report delivery rate, project completion rate, and monthly velocity trend' },
      { type: 'new', text: 'Per-project Notes tab: private team notes auto-saved and included in AI prompts when generating findings or summaries' },
      { type: 'new', text: 'Notes sync across team members with 20 s polling and idle-aware conflict detection' },
      { type: 'improved', text: 'AI finding generation now receives engagement notes as context for higher-quality, client-aware output' },
      { type: 'improved', text: 'Report prompts upgraded — business impact emphasis, compliance mapping (PCI-DSS, ISO 27001), and executive-ready language' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-10',
    title: 'Report Approval Workflow',
    summary: 'Full report lifecycle with draft → in-review → approved/rejected states, reviewer assignment, and webhook notifications for every transition.',
    changes: [
      { type: 'new', text: 'Report status workflow: draft → in-review → approved / rejected' },
      { type: 'new', text: 'Editing a finalised report automatically reverts it to in-review and notifies a randomly assigned reviewer' },
      { type: 'new', text: 'Approve / Reject buttons with optional reviewer comment' },
      { type: 'new', text: 'Report Activity card on Dashboard — shows pending reviews and decisions on your submitted reports' },
      { type: 'new', text: 'Webhook payloads for all report events: submitted, approved, rejected, reverted to review' },
      { type: 'improved', text: 'Reports page filter fixed — counts and filter chips now reflect live data correctly' },
      { type: 'fixed', text: 'Each project enforces a single report — duplicate report creation is now prevented' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-09',
    title: 'Docker Deploy + One-Command Setup',
    summary: 'Production-ready Docker deployment script that spins up PostgreSQL, builds the app, applies migrations, and seeds the first admin account in one command.',
    changes: [
      { type: 'new', text: 'docker-deploy.sh: single-file production deploy — PostgreSQL container, network, migrations, app container, admin seed, credential file' },
      { type: 'new', text: 'Auto-generated secure admin password saved to aegis-credentials.txt (chmod 600)' },
      { type: 'new', text: 'Demo credentials no longer shown on the login page in production builds' },
      { type: 'new', text: 'New finding redirect fixed — POST response now returns the correct finding ID for navigation' },
      { type: 'improved', text: 'Webhook messages reformatted with rich HTML, severity emoji, CVSS score, assigned user, and timestamp' },
      { type: 'improved', text: 'Migrations are idempotent (IF NOT EXISTS) and run in order before the app build' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-05-05',
    title: 'Initial Release',
    summary: 'Core penetration test reporting platform with project management, finding editor, report generation, team management, and audit trail.',
    changes: [
      { type: 'new', text: 'Project management: create, edit, and track engagements with status, dates, scope, and team members' },
      { type: 'new', text: 'Finding editor: severity, CVSS, CWE/OWASP mapping, affected assets, reproduction steps, impact, and remediation' },
      { type: 'new', text: 'Evidence uploads: attach screenshots and files to findings' },
      { type: 'new', text: 'AI-powered report generation: GPT-style prompts produce executive summaries, finding narratives, and remediation guidance' },
      { type: 'new', text: 'Report templates: reusable templates with custom sections and placeholders' },
      { type: 'new', text: 'Vulnerability library: cross-project finding list with severity/status/project filters' },
      { type: 'new', text: 'Team management: user roles (admin, lead, analyst), project assignment, and activity feed' },
      { type: 'new', text: 'Audit trail: full history of every create/edit/status change across all projects' },
      { type: 'new', text: 'Dashboard: active projects, open findings breakdown, severity trend chart, upcoming deadlines, team load' },
      { type: 'new', text: 'Mentions: @-mention teammates in finding comments, with notification badge on Dashboard' },
      { type: 'new', text: 'Webhook integration: configurable webhook for finding and report events (Teams/Slack compatible)' },
      { type: 'new', text: 'Dark-first editorial UI with configurable accent colours and severity palettes' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHANGE_META: Record<ChangeType, { label: string; color: string; bg: string; border: string }> = {
  new:      { label: 'New',      color: '#6fd0ff', bg: 'rgba(111,208,255,0.08)', border: 'rgba(111,208,255,0.22)' },
  improved: { label: 'Improved', color: '#8fc97a', bg: 'rgba(143,201,122,0.08)', border: 'rgba(143,201,122,0.22)' },
  fixed:    { label: 'Fixed',    color: '#f5a524', bg: 'rgba(245,165,36,0.08)',  border: 'rgba(245,165,36,0.22)'  },
  security: { label: 'Security', color: '#ff5c3a', bg: 'rgba(255,92,58,0.08)',   border: 'rgba(255,92,58,0.22)'   },
  breaking: { label: 'Breaking', color: '#c9a8f5', bg: 'rgba(201,168,245,0.08)', border: 'rgba(201,168,245,0.22)' },
};

function ChangeTag({ type }: { type: ChangeType }) {
  const m = CHANGE_META[type];
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      color: m.color, background: m.bg,
      border: `1px solid ${m.border}`,
      borderRadius: 3, padding: '2px 6px',
      flexShrink: 0,
    }}>
      {m.label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ChangelogPage() {
  await connection();

  const totalChanges = RELEASES.reduce((acc, r) => acc + r.changes.length, 0);
  const newFeatures  = RELEASES.reduce((acc, r) => acc + r.changes.filter(c => c.type === 'new').length, 0);
  const fixes        = RELEASES.reduce((acc, r) => acc + r.changes.filter(c => c.type === 'fixed').length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title="Changelog" breadcrumb={['Aegis', 'Changelog']} />

      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 28px 64px' }}>

          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ margin: 0, fontSize: 32, fontWeight: 400, color: 'var(--ink-0)' }}>
                AEGIS — Release Notes
              </h1>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Penetration Test Reporting Platform</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              Full changelog for all AEGIS releases. Suitable for team wikis and Confluence documentation.
            </p>
            <div style={{ display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Releases', value: RELEASES.length },
                { label: 'Total changes', value: totalChanges },
                { label: 'New features', value: newFeatures },
                { label: 'Bug fixes', value: fixes },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', minWidth: 80 }}>
                  <div className="serif" style={{ fontSize: 28, color: 'var(--accent)', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
            {(Object.keys(CHANGE_META) as ChangeType[]).map(type => (
              <ChangeTag key={type} type={type} />
            ))}
          </div>

          {/* Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {RELEASES.map((release, i) => (
              <ReleaseCard key={release.version} release={release} isLast={i === RELEASES.length - 1} />
            ))}
          </div>

          {/* Confluence export note */}
          <div style={{
            marginTop: 48,
            padding: '16px 20px',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--r-sm)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--ink-0)' }}>Confluence tip:</strong>{' '}
              Copy this page URL into a Confluence &ldquo;iframe&rdquo; macro, or use the{' '}
              <span className="mono" style={{ fontSize: 11 }}>Print / Save as PDF</span> option (Ctrl+P → Save as PDF)
              to produce a portable document for stakeholder distribution.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Release Card ─────────────────────────────────────────────────────────────

function ReleaseCard({ release, isLast }: { release: Release; isLast: boolean }) {
  const typeCounts = (release.changes as Change[]).reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* Timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48, flexShrink: 0 }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 22,
          background: release.highlight ? 'var(--accent)' : 'var(--bg-3)',
          border: `2px solid ${release.highlight ? 'var(--accent)' : 'var(--line-2)'}`,
          boxShadow: release.highlight ? '0 0 0 4px rgba(var(--accent-rgb,244,241,234),0.15)' : 'none',
        }} />
        {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--line-1)', marginTop: 4 }} />}
      </div>

      {/* Card */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 32, paddingLeft: 16 }}>
        <div className="card" style={{ overflow: 'hidden', ...(release.highlight ? { borderColor: 'var(--line-2)' } : {}) }}>
          {/* Card header */}
          <div style={{
            padding: '18px 24px 16px',
            borderBottom: '1px solid var(--line-1)',
            background: release.highlight ? 'rgba(244,241,234,0.03)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                    color: release.highlight ? 'var(--accent)' : 'var(--ink-1)',
                    background: release.highlight ? 'rgba(244,241,234,0.1)' : 'var(--bg-3)',
                    border: `1px solid ${release.highlight ? 'rgba(244,241,234,0.2)' : 'var(--line-1)'}`,
                    borderRadius: 4, padding: '3px 8px',
                  }}>
                    v{release.version}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{release.date}</span>
                  {release.highlight && (
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'rgba(244,241,234,0.1)', border: '1px solid rgba(244,241,234,0.2)', borderRadius: 3, padding: '2px 6px' }}>
                      LATEST
                    </span>
                  )}
                </div>
                <h2 className="serif" style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--ink-0)' }}>
                  {release.title}
                </h2>
              </div>
              {/* Change type summary badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                {(Object.entries(typeCounts) as [ChangeType, number][]).map(([type, count]) => (
                  <span key={type} style={{
                    fontSize: 10, fontFamily: 'var(--font-mono)',
                    color: CHANGE_META[type].color,
                    background: CHANGE_META[type].bg,
                    border: `1px solid ${CHANGE_META[type].border}`,
                    borderRadius: 3, padding: '2px 8px',
                  }}>
                    {count} {type}
                  </span>
                ))}
              </div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              {release.summary}
            </p>
          </div>

          {/* Changes list */}
          <div style={{ padding: '4px 0 8px' }}>
            {release.changes.map((change, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 24px',
                borderBottom: i < release.changes.length - 1 ? '1px solid var(--line-0)' : 'none',
              }}>
                <div style={{ paddingTop: 1, flexShrink: 0 }}>
                  <ChangeTag type={change.type} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{change.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
