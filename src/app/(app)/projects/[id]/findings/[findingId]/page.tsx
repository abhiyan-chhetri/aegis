import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { UnifiedFindingEditor } from '@/components/findings/UnifiedFindingEditor';

type Props = { params: Promise<{ id: string; findingId: string }> };

export default async function FindingPage({ params }: Props) {
  const { id, findingId } = await params;

  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      project: true,
      assignee: true,
      evidence: true,
      activities: { include: { user: true }, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!finding || finding.projectId !== id) notFound();

  let assets: string[] = [];
  try { assets = JSON.parse(finding.assets); } catch { assets = []; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Projects', finding.project.name, 'Findings']}
        title={finding.title}
        subtitle={`${finding.code} · ${finding.project.code}`}
        actions={
          <Link href={`/projects/${id}`} className="btn btn-ghost btn-sm">
            <Ico name="chevLeft" size={14} />
            Back to project
          </Link>
        }
      />
      <UnifiedFindingEditor
        finding={finding as never}
        assets={assets}
        projectId={id}
        isEditing={true}
      />
    </div>
  );
}
