import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { TrackRecent } from '@/components/chrome/TrackRecent';
import { Ico } from '@/components/chrome/icons';
import { UnifiedFindingEditor } from '@/components/findings/UnifiedFindingEditor';
import { FindingTrafficPanel } from '@/components/burp/FindingTrafficPanel';

type Props = { params: Promise<{ id: string; findingId: string }> };

export default async function FindingPage({params }: Props) {
  await connection();
  const { id, findingId } = await params;

  const [finding, ownerRows, projectRows] = await Promise.all([
    db.finding.findUnique({
      where: { id: findingId },
      include: {
        project: true,
        assignee: true,
        evidence: true,
        activities: { include: { user: true }, orderBy: { createdAt: 'desc' } },
      },
    }),
    db.$queryRawUnsafe<{ assetOwner: string }[]>(
      `SELECT DISTINCT "assetOwner" FROM "Finding" WHERE "projectId" = $1 AND "assetOwner" != '' ORDER BY "assetOwner"`, id
    ).catch(() => [] as { assetOwner: string }[]),
    db.$queryRawUnsafe<{ assetOwners: string }[]>(
      `SELECT COALESCE("assetOwners", '[]') as "assetOwners" FROM "Project" WHERE id = $1`, id
    ).catch(() => [] as { assetOwners: string }[]),
  ]);

  if (!finding || finding.projectId !== id) notFound();

  let assets: string[] = [];
  try { assets = JSON.parse(finding.assets); } catch { assets = []; }

  let projectOwners: string[] = [];
  try { projectOwners = JSON.parse(projectRows[0]?.assetOwners ?? '[]'); } catch { /* noop */ }

  const ownerSuggestions = Array.from(new Set([
    ...projectOwners,
    ...ownerRows.map(r => r.assetOwner),
  ])).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <TrackRecent
        id={finding.id}
        type="finding"
        label={finding.title}
        sub={`${finding.code} · ${finding.project.name}`}
        href={`/projects/${id}/findings/${finding.id}`}
        icon="alert"
        severity={finding.severity}
      />
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
        ownerSuggestions={ownerSuggestions}
      />
      <FindingTrafficPanel projectId={id} findingId={findingId} />
    </div>
  );
}
