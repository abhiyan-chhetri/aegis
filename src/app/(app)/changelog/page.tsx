import { connection } from 'next/server';
import React from 'react';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { CopyButton } from './CopyButton';

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
    version: '1.6.0',
    date: '2026-05-15',
    title: 'Google Docs-Style Live Streaming, Real Markdown Everywhere & Smarter AI',
    summary: 'The collaboration model is now true live streaming — no more "Use theirs / Keep mine" prompts. As teammates type, their changes appear on your screen with the caret staying exactly where you left it. We also threw out the home-grown markdown parser and replaced it with a real CommonMark + GitHub-flavoured library, so tables, autolinks, task lists and underscores-in-URLs finally work everywhere they should.',
    highlight: true,
    changes: [
      { type: 'new', text: 'Live streaming edits — when a teammate is typing on the same notes or report content, their changes flow into your editor in real time with the typing caret visible in their colour; no more "Use theirs / Keep mine" decision banner' },
      { type: 'new', text: 'Multi-user typing indicators — every editor now shows a coloured caret and name badge for each person currently typing in that field' },
      { type: 'new', text: 'Per-section AI generation — when generating a finding with AI, choose to fill only Description, only Impact, only Recommendations, only References, or the whole thing; manual edits in other fields are preserved' },
      { type: 'new', text: 'Report Content editor now has the full Notes-style toolbar — image upload, image paste from clipboard, drag-and-drop, write/preview toggle and live-streaming co-editing for Executive Summary and Attack Narrative' },
      { type: 'new', text: '"Approved by" column in Revision History — the pentest report cover page now shows who reviewed and approved the report, with the approval date alongside the author' },
      { type: 'new', text: 'Per-version copy button on the changelog — click "Copy" on any release card to grab a ready-to-paste markdown summary for Confluence, email or Slack' },
      { type: 'improved', text: 'Markdown rendering throughout — Vulnerability Library, finding cards, Report Content, Executive Summary, Attack Narrative and the final report all use the same react-markdown engine; bold, italic, links, tables, code blocks, strikethrough and task lists now render correctly everywhere' },
      { type: 'improved', text: 'Report pagination — atomic blocks (images, code blocks, callouts) are no longer split mid-element across pages; if a block doesn\'t fit on the current page it flows whole to the next page, just like Microsoft Word' },
      { type: 'improved', text: 'Code blocks in reports now have syntax-highlighted tokens (keywords, strings, comments, numbers) on the same dark theme' },
      { type: 'improved', text: 'Inline markdown rendering in "Key Areas for Improvement" and "Immediate Actions" — finding titles and remediation snippets now render bold, italic and inline code instead of showing raw asterisks' },
      { type: 'improved', text: 'Numbered list markers in reports now render correctly (1. 2. 3. …) — previously they were sometimes hidden by tight margins' },
      { type: 'improved', text: 'Faster live save cadence (400 ms) so co-editors see each other\'s changes more quickly' },
      { type: 'fixed', text: 'Underscores inside URLs (e.g. https://test.com/foo_bar) no longer trigger italic markdown formatting in the report' },
      { type: 'fixed', text: 'Markdown links [text](url) now render as clickable links throughout the report' },
      { type: 'fixed', text: 'AI-generated finding title is now applied to the title field (previously silently discarded)' },
      { type: 'fixed', text: 'Approve / Reject buttons on the pentest report are now visible only to the assigned reviewer; other users see the review status read-only' },
      { type: 'fixed', text: 'Webhook delivery (Teams / Slack) now accepts self-signed and internal-CA TLS certificates' },
      { type: 'fixed', text: '"Retest Window" row removed from the Engagement Timeline — was misleading when no retest was contracted' },
      { type: 'fixed', text: 'Image dimensions can now be set inline — write ![Screenshot|400x300](src) or ![diagram|medium](src) to size figures' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-05-11',
    title: 'Google Docs-Style Live Editing, Smarter Project Organisation & Full Audit Trail',
    summary: 'The biggest quality-of-life update yet. Multiple consultants can now edit the same finding or engagement notes at the same time and instantly see each other\'s changes — no more overwriting each other\'s work. Projects are also now organised by client rather than by individual engagement, so the project list stays clean no matter how many years of retests you have.',
    highlight: true,
    changes: [
      { type: 'new', text: 'Live co-editing for Engagement Notes — when a teammate is typing you see a live "Sarah is typing…" indicator and their changes appear on your screen the moment they save, just like Google Docs' },
      { type: 'new', text: 'Live co-editing for Findings — if two consultants open the same finding at the same time, each person sees a banner ("John is editing Impact…") so there is no accidental overwriting' },
      { type: 'new', text: 'Finding comments & activity feed — every finding now has a dedicated Comments section (with @mention support) and a full activity log showing who changed what and when' },
      { type: 'new', text: 'One card per client on the Projects page — "Apple Website" now appears as a single row regardless of how many yearly retests exist; a badge shows the total engagement count (e.g. "3 engagements")' },
      { type: 'new', text: 'Year-selector landing page — clicking a client opens a visual card grid of all their engagement years (2024, 2025, 2026 …); clicking a year card goes to that engagement\'s findings and notes' },
      { type: 'new', text: 'Cleaner URLs — engagement pages now use human-readable addresses like /projects/PEN-222/2026 so links in emails and tickets actually make sense' },
      { type: 'new', text: 'Clickable breadcrumb trail — every finding and engagement page shows "Projects › PEN-222 › 2025" at the top; each part is a clickable link so you can jump back without hitting the browser back button' },
      { type: 'new', text: 'Delete actions are now audited — removing a project or finding is recorded in the audit log with the consultant\'s name, timestamp, and what was deleted, so nothing disappears without a trace' },
      { type: 'improved', text: 'Creating a new project is simpler — the "Target Code" field has been removed from the form; the platform handles grouping automatically behind the scenes' },
      { type: 'improved', text: 'After creating a project you land on the engagement year overview straight away instead of having to navigate there manually' },
      { type: 'fixed', text: 'Older projects created before the multi-year update now display correctly as individual cards without any broken links' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-11',
    title: 'Team Awareness, Asset Ownership & Smarter Vulnerability Library',
    summary: 'You can now see exactly who else is working in the platform at any given moment, track which internal team or system owns each vulnerable asset, and browse the full vulnerability library with faster filters and pages.',
    changes: [
      { type: 'new', text: 'Live presence avatars — coloured profile bubbles appear in the top corner of any finding or notes page showing which team members currently have that page open' },
      { type: 'new', text: 'Conflict resolution banner for notes — if two people edit the same notes at the same time a banner appears asking "Use theirs / Keep mine" so no work is lost' },
      { type: 'new', text: 'Asset Owner tracking on findings — each finding can be tagged with the client team or system responsible for the vulnerability (e.g. "Payments Platform", "API Gateway"), making remediation hand-offs much clearer' },
      { type: 'new', text: 'Asset Owners overview tab per project — shows which client teams have the most unresolved vulnerabilities, their average fix rate, and a severity breakdown so consultants know where to focus remediation conversations' },
      { type: 'new', text: 'Asset owner autocomplete — typing in the owner field suggests names already used across previous engagements, keeping naming consistent' },
      { type: 'improved', text: 'New findings are automatically assigned to the consultant who created them so nothing is left unassigned by mistake' },
      { type: 'improved', text: 'Vulnerability library now has an Assignee filter — quickly see all findings assigned to a specific person across every project' },
      { type: 'improved', text: 'Vulnerability library now paginates at 25 items per page so the page loads fast even with hundreds of findings' },
      { type: 'fixed', text: 'Platform now applies any missing database updates automatically on startup — no manual database commands required after an update' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05-11',
    title: 'Management Dashboard & AI-Assisted Report Writing',
    summary: 'A new executive-level dashboard gives managers a monthly business review view of the entire programme at a glance. AI report generation is now smarter, using the team\'s private engagement notes as context to produce more accurate and client-specific content.',
    changes: [
      { type: 'new', text: 'Portfolio / MBR dashboard — one page showing the health of the entire pentest programme: overall resolution rate, average risk score, mean time to fix, how many reports have been delivered on time, and a month-by-month finding velocity chart' },
      { type: 'new', text: 'Engagement Notes tab — a private scratchpad per project for testers to capture recon observations, client context, and anything the AI should know when writing the report' },
      { type: 'new', text: 'Notes are shared across the whole team and sync automatically — everyone on the engagement sees the same notes without needing to share documents separately' },
      { type: 'improved', text: 'AI report generation now reads the engagement notes first, producing executive summaries and finding descriptions that reflect the specific client context rather than generic boilerplate' },
      { type: 'improved', text: 'AI-generated content now emphasises business impact and compliance relevance (PCI-DSS, ISO 27001) to make reports more useful for client stakeholders' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-10',
    title: 'Report Review & Approval Workflow',
    summary: 'Reports now go through a formal review cycle before they can be marked as final. Every status change triggers an automatic Teams notification so the right person always knows what action is needed.',
    changes: [
      { type: 'new', text: 'Four-stage report lifecycle — Draft → Submitted for Review → Approved / Rejected — ensuring every report is reviewed before delivery to the client' },
      { type: 'new', text: 'If a consultant edits a report that has already been approved, it is automatically moved back to "In Review" and a reviewer is notified, preventing unapproved changes from going out' },
      { type: 'new', text: 'Reviewers can approve or reject with a written comment, giving clear written feedback the author can act on' },
      { type: 'new', text: 'Dashboard activity card — shows each consultant which of their reports are waiting for review and what feedback has been left on previously submitted reports' },
      { type: 'new', text: 'Automatic Teams / Slack webhook notifications for every report status change so the team is always informed without checking the platform manually' },
      { type: 'improved', text: 'Report status filters now show accurate counts that update in real time' },
      { type: 'fixed', text: 'A bug that occasionally allowed duplicate report drafts to be created for the same project has been resolved' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-09',
    title: 'One-Command Production Deployment',
    summary: 'The platform can now be stood up on a fresh server in a single command. Everything — the database, the application, and the first admin account — is created and configured automatically.',
    changes: [
      { type: 'new', text: 'Single-command Docker deployment — running one script sets up the database, builds and starts the application, creates the first admin account, and saves all credentials to a secure local file' },
      { type: 'new', text: 'Credentials file (aegis-credentials.txt) is generated automatically on first deploy with a strong random password, saved with restricted file permissions' },
      { type: 'new', text: 'Login page no longer shows demo credentials in production mode' },
      { type: 'improved', text: 'Teams / Slack webhook notifications now include severity emoji, CVSS score, assigned consultant, and exact timestamp for richer context' },
      { type: 'improved', text: 'All database migration steps are safe to re-run — deploying an update will never fail because a column or table already exists' },
      { type: 'fixed', text: 'Saving a new finding now correctly redirects to the finding detail page instead of showing an error' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-05-05',
    title: 'Initial Launch',
    summary: 'AEGIS is live. A purpose-built platform for the penetration testing team that replaces Word documents and spreadsheets with a structured, searchable, and audited workflow — from scoping to final report delivery.',
    changes: [
      { type: 'new', text: 'Project management — create and track engagements with client name, scope, dates, lead consultant, and team members; filter by status at a glance' },
      { type: 'new', text: 'Structured finding editor — capture every vulnerability with severity rating, CVSS score, CWE and OWASP classification, affected assets, reproduction steps, business impact, and remediation advice' },
      { type: 'new', text: 'Evidence attachments — upload screenshots, request/response captures, and supporting files directly onto each finding' },
      { type: 'new', text: 'AI-assisted report writing — describe a vulnerability and the AI generates professional-quality summary, impact, and remediation text in seconds, which consultants then review and edit' },
      { type: 'new', text: 'Report templates — create reusable report structures so every engagement follows the same format without starting from scratch each time' },
      { type: 'new', text: 'Vulnerability library — a cross-project searchable list of every finding ever recorded, filterable by severity, status, project, and assignee' },
      { type: 'new', text: 'Team management — role-based access (Admin, Lead, Analyst), per-project team assignment, and individual workload visibility' },
      { type: 'new', text: 'Audit trail — a tamper-evident log of every action taken in the platform: who created, edited, or changed the status of any finding or project, and when' },
      { type: 'new', text: 'Dashboard — at-a-glance view of active projects, open vulnerability counts by severity, a 12-week risk trend chart, approaching deadlines, and team workload' },
      { type: 'new', text: '@mention comments on findings — tag a teammate in a comment to flag something for their attention; they see a notification badge on their dashboard' },
      { type: 'new', text: 'Webhook integration — connects to Microsoft Teams or Slack to send real-time alerts whenever a finding is resolved, a severity changes, or a report status changes' },
      { type: 'new', text: 'Dark-mode editorial interface designed for long reporting sessions, with configurable colour accents' },
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

  const confluenceText = RELEASES.map(r => {
    const typeLabel: Record<string, string> = { new: '(+)', improved: '(~)', fixed: '(!)', security: '(!) SECURITY', breaking: '(x) BREAKING' };
    const lines = [
      `h2. v${r.version} — ${r.title} (${r.date})`,
      r.summary,
      '',
      ...r.changes.map(c => `* ${typeLabel[c.type] || c.type} ${c.text}`),
      '',
      '----',
    ];
    return lines.join('\n');
  }).join('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title="Changelog" breadcrumb={['Aegis', 'Changelog']} actions={<CopyButton text={confluenceText} />} />

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

function formatReleaseAsMarkdown(release: Release): string {
  const lines: string[] = [];
  lines.push(`# Aegis v${release.version} — ${release.title}`);
  lines.push(`*Released ${release.date}*`);
  lines.push('');
  lines.push(release.summary);
  lines.push('');
  const byType: Record<ChangeType, string[]> = { new: [], improved: [], fixed: [], security: [], breaking: [] };
  for (const c of release.changes) byType[c.type].push(c.text);
  const headings: Record<ChangeType, string> = {
    new: 'What\'s new',
    improved: 'Improvements',
    fixed: 'Fixes',
    security: 'Security',
    breaking: 'Breaking changes',
  };
  (Object.keys(headings) as ChangeType[]).forEach(t => {
    if (byType[t].length === 0) return;
    lines.push(`## ${headings[t]}`);
    for (const text of byType[t]) lines.push(`- ${text}`);
    lines.push('');
  });
  return lines.join('\n').trim() + '\n';
}

function ReleaseCard({ release, isLast }: { release: Release; isLast: boolean }) {
  const typeCounts = (release.changes as Change[]).reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const markdown = formatReleaseAsMarkdown(release);

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
              {/* Change type summary badges + per-version copy */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
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
                <CopyButton text={markdown} label={`v${release.version}`} />
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
