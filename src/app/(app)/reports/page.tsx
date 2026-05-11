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

  // Merge: raw SQL values take precedence over Prisma-returned fields
  const enrichedAll = reports.map(r => ({
    ...r,
    status:        rawMap[r.id]?.status        ?? r.status ?? 'draft',
    reviewComment: rawMap[r.id]?.reviewComment ?? '',
    reviewedAt:    rawMap[r.id]?.reviewedAt    ?? null,
    reviewerId:    rawMap[r.id]?.reviewerId    ?? null,
    reviewerName:  rawMap[r.id]?.reviewerName  ?? null,
  }));

  // Deduplicate: keep only 1 report per project (latest first)
  const seen = new Set<string>();
  const enriched = enrichedAll.filter(r => {
    if (seen.has(r.projectId)) return false;
    seen.add(r.projectId);
    return true;
  });

  // Clean up any duplicate reports from DB (keep latest, delete the rest)
  const idsToDelete = enrichedAll
    .filter(r => !enriched.find(e => e.id === r.id))
    .map(r => r.id);
  if (idsToDelete.length > 0) {
    await db.report.deleteMany({ where: { id: { in: idsToDelete } } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Reports']}
        title="Reports"
        subtitle={`${enriched.length} deliverables`}
      />
      <ReportsClient reports={enriched as any} currentUserId={session?.id ?? ''} />
    </div>
  );
}
