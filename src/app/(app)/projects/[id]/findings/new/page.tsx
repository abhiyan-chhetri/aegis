import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { UnifiedFindingEditor } from '@/components/findings/UnifiedFindingEditor';

type Props = { params: Promise<{ id: string }> };

export default async function NewFindingPage({ params }: Props) {
  const { id } = await params;

  const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true, code: true } });
  if (!project) notFound();

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
      <UnifiedFindingEditor projectId={id} isEditing={false} />
    </div>
  );
}
