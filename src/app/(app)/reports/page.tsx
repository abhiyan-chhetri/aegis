import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { ReportsClient } from './ReportsClient';

export default async function ReportsPage() {
  const reports = await db.report.findMany({
    include: { project: true, author: true, template: true },
    orderBy: { createdAt: 'desc' },
  });

  // Merge raw review fields
  const ids = reports.map(r => r.id);
  const rawFields = ids.length > 0
    ? await db.$queryRawUnsafe<{ id: string; reviewComment: string; reviewedAt: string | null; reviewerId: string | null }[]>(
        `SELECT id, "reviewComment", "reviewedAt", "reviewerId" FROM "Report" WHERE id IN (${ids.map((_: any, i: number) => `$${i + 1}`).join(',')})`,
        ...ids
      )
    : [];
  const rawMap = Object.fromEntries(rawFields.map(r => [r.id, r]));

  const enriched = reports.map(r => ({
    ...r,
    reviewComment: rawMap[r.id]?.reviewComment ?? '',
    reviewedAt: rawMap[r.id]?.reviewedAt ?? null,
    reviewerId: rawMap[r.id]?.reviewerId ?? null,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Reports']}
        title="Reports"
        subtitle={`${reports.length} deliverables`}
      />
      <ReportsClient reports={enriched as any} />
    </div>
  );
}
