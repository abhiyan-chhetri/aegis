/* eslint-disable @typescript-eslint/no-explicit-any */

import { connection } from 'next/server';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { ReportsClient } from './ReportsClient';
import { getSession } from '@/lib/auth';

export default async function ReportsPage() {
  await connection();
  const session = await getSession();

  const reports = await db.report.findMany({
    include: { project: true, author: true, template: true },
    orderBy: { createdAt: 'desc' },
  });

  // Use raw SQL for all review/status fields to guarantee fresh DB values
  // (bypasses any Prisma client cache / schema-mismatch issues)
  const ids = reports.map(r => r.id);
  const rawFields = ids.length > 0
    ? await db.$queryRawUnsafe<{
        id: string;
        status: string;
        reviewComment: string;
        reviewedAt: string | null;
        reviewerId: string | null;
        reviewerName: string | null;
      }[]>(
        `SELECT r.id, r.status, r."reviewComment", r."reviewedAt", r."reviewerId",
                u.name AS "reviewerName"
         FROM "Report" r
         LEFT JOIN "User" u ON u.id = r."reviewerId"
         WHERE r.id IN (${ids.map((_: any, i: number) => `$${i + 1}`).join(',')})`,
        ...ids
      )
    : [];
  const rawMap = Object.fromEntries(rawFields.map(r => [r.id, r]));

  // Backfill Report.version from the highest ReportVersion.versionNumber so
  // the listing matches the history modal. (Historic data was orphaned because
  // the review endpoint used to only insert a snapshot, never bump the parent.)
  const maxVers = ids.length > 0
    ? await db.$queryRawUnsafe<{ reportId: string; max: number }[]>(
        `SELECT "reportId", MAX("versionNumber")::int AS max
         FROM "ReportVersion"
         WHERE "reportId" IN (${ids.map((_: any, i: number) => `$${i + 1}`).join(',')})
         GROUP BY "reportId"`,
        ...ids
      ).catch(() => [] as { reportId: string; max: number }[])
    : [];
  const maxVerMap = Object.fromEntries(maxVers.map(r => [r.reportId, `v${r.max}`]));

  // Merge: raw SQL values take precedence over Prisma-returned fields.
  // NOTE: We used to dedup-by-projectId AND DELETE the "extras" from the DB
  // here on every page render. That was destroying legitimate version
  // history (each project can have multiple Report rows — v1, v2, …) and
  // also turned a GET into a destructive operation. Show everything; let
  // the user filter / use the per-project version history modal instead.
  const enriched = reports.map(r => ({
    ...r,
    version:       maxVerMap[r.id]             ?? r.version ?? 'v1',
    status:        rawMap[r.id]?.status        ?? r.status ?? 'draft',
    reviewComment: rawMap[r.id]?.reviewComment ?? '',
    reviewedAt:    rawMap[r.id]?.reviewedAt    ?? null,
    reviewerId:    rawMap[r.id]?.reviewerId    ?? null,
    reviewerName:  rawMap[r.id]?.reviewerName  ?? null,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Reports']}
        title="Reports"
        subtitle={`${enriched.length} deliverable${enriched.length === 1 ? '' : 's'}`}
      />
      <ReportsClient reports={enriched as any} currentUserId={session?.id ?? ''} />
    </div>
  );
}
