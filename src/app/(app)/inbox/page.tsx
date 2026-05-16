/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Inbox — workspace-wide "@me" view.
 *
 * Surfaces three things scoped to the current user:
 *   1. Comments mentioning me
 *   2. Reports where I'm the assigned reviewer (pending review)
 *   3. Findings assigned to me (open / in-progress)
 *
 * Single page, three tabs, "unread" counter on each. Server-component
 * fetches the raw data once; the client component renders + filters.
 */
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Topbar } from '@/components/chrome/Topbar';
import { InboxClient } from './InboxClient';

export default async function InboxPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect('/login');

  // ── 1. Mentions ─────────────────────────────────────────────────────────────
  // FindingComment.mentions stores a JSON array of user-ids. Use a raw query to
  // pull only comments where the JSON array contains my id.
  const mentionRows = await db.$queryRawUnsafe<Array<{
    id: string;
    content: string;
    createdAt: Date;
    findingId: string;
    findingTitle: string;
    findingCode: string;
    findingSeverity: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    authorId: string;
    authorName: string;
    authorInitials: string;
  }>>(`
    SELECT fc.id, fc.content, fc."createdAt",
           f.id AS "findingId", f.title AS "findingTitle", f.code AS "findingCode", f.severity AS "findingSeverity",
           p.id AS "projectId", p.name AS "projectName", p.code AS "projectCode",
           u.id AS "authorId", u.name AS "authorName", u.initials AS "authorInitials"
    FROM "FindingComment" fc
    JOIN "Finding" f ON f.id = fc."findingId"
    JOIN "Project" p ON p.id = f."projectId"
    JOIN "User"    u ON u.id = fc."userId"
    WHERE fc.mentions::text LIKE '%' || $1 || '%'
      AND fc."userId" <> $1
    ORDER BY fc."createdAt" DESC
    LIMIT 200
  `, session.id).catch(() => [] as never[]);

  // ── 2. Reports awaiting my review ──────────────────────────────────────────
  const reviewRows = await db.report.findMany({
    where: { reviewerId: session.id, status: 'in-review' },
    select: {
      id: true,
      code: true,
      version: true,
      createdAt: true,
      project: { select: { id: true, name: true, code: true } },
      author: { select: { id: true, name: true, initials: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  }).catch(() => []);

  // ── 3. Findings assigned to me, still open ─────────────────────────────────
  const findingRows = await db.finding.findMany({
    where: {
      assigneeId: session.id,
      status: { in: ['open', 'in_progress', 'in-progress'] },
    },
    select: {
      id: true,
      code: true,
      title: true,
      severity: true,
      status: true,
      cvss: true,
      createdAt: true,
      project: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  }).catch(() => []);

  const data = {
    mentions: mentionRows.map(r => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      findingId: r.findingId,
      findingTitle: r.findingTitle,
      findingCode: r.findingCode,
      findingSeverity: r.findingSeverity,
      projectId: r.projectId,
      projectName: r.projectName,
      projectCode: r.projectCode,
      author: { id: r.authorId, name: r.authorName, initials: r.authorInitials },
    })),
    reviews: reviewRows.map(r => ({
      id: r.id,
      code: r.code,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      project: r.project ? { id: r.project.id, name: r.project.name, code: r.project.code } : null,
      author: r.author ? { id: r.author.id, name: r.author.name, initials: r.author.initials } : null,
    })),
    findings: findingRows.map(f => ({
      id: f.id,
      code: f.code,
      title: f.title,
      severity: f.severity,
      status: f.status,
      cvss: f.cvss,
      createdAt: f.createdAt.toISOString(),
      project: f.project ? { id: f.project.id, name: f.project.name, code: f.project.code } : null,
    })),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        title="Inbox"
        breadcrumb={['Workspace', 'Inbox']}
        subtitle="Everything that needs your attention — across every project."
      />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <InboxClient data={data as any} />
      </div>
    </div>
  );
}
