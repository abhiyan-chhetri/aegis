export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { UnifiedFindingEditor } from '@/components/findings/UnifiedFindingEditor';

type Props = { params: Promise<{ id: string }> };

export default async function NewFindingPage({ params }: Props) {
  const { id } = await params;

  const [project, ownerRows, projectRows] = await Promise.all([
    db.project.findUnique({ where: { id }, select: { id: true, name: true, code: true } }),
    db.$queryRawUnsafe<{ assetOwner: string }[]>(
      `SELECT DISTINCT "assetOwner" FROM "Finding" WHERE "projectId" = $1 AND "assetOwner" != '' ORDER BY "assetOwner"`, id
    ).catch(() => [] as { assetOwner: string }[]),
    db.$queryRawUnsafe<{ assetOwners: string }[]>(
      `SELECT COALESCE("assetOwners", '[]') as "assetOwners" FROM "Project" WHERE id = $1`, id
    ).catch(() => [] as { assetOwners: string }[]),
  ]);
  if (!project) notFound();

  let projectOwners: string[] = [];
  try { projectOwners = JSON.parse(projectRows[0]?.assetOwners ?? '[]'); } catch { /* noop */ }

  const ownerSuggestions = Array.from(new Set([
    ...projectOwners,
    ...ownerRows.map(r => r.assetOwner),
  ])).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Projects', project.name, 'New Finding']}
        title="New Finding"
        subtitle={`${project.code}`}
        actions={
          <Link href={`/projects/${id}`} className="btn btn-ghost btn-sm">
            <Ico name="chevLeft" size={14} />
            Cancel
          </Link>
        }
      />
      <UnifiedFindingEditor projectId={id} isEditing={false} ownerSuggestions={ownerSuggestions} />
    </div>
  );
}
