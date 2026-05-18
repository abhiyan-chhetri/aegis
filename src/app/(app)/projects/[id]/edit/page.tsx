import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ensureEnvColumns } from '@/lib/ensure-env-columns';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { EditProjectForm } from './EditProjectForm';

type Props = { params: Promise<{ id: string }> };

export default async function EditProjectPage({params }: Props) {
  await connection();
  const { id } = await params;

  // Self-heal v2.0 columns before any query that reads them (cached after
  // first call so subsequent requests are a no-op).
  await ensureEnvColumns().catch(() => { /* keep going — fallback below */ });

  const [project, users, rawRows] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: { lead: true },
    }),
    db.user.findMany({ select: { id: true, name: true, email: true, role: true, team: true } }),
    db.$queryRawUnsafe<Record<string, string>[]>(
      `SELECT members,
              COALESCE("targetCode",'') AS "targetCode",
              COALESCE("engagementYear",'') AS "engagementYear",
              COALESCE("dataClassification",'C3') AS "dataClassification",
              COALESCE("criticality",'silver') AS "criticality",
              COALESCE("engagementType",'external') AS "engagementType"
       FROM "Project" WHERE id = $1`, id
    ).catch(() =>
      // Old DB without the columns — fall back to the previous shape and
      // synthesize the env defaults so the page still renders.
      db.$queryRawUnsafe<Record<string, string>[]>(
        `SELECT members,
                COALESCE("targetCode",'') AS "targetCode",
                COALESCE("engagementYear",'') AS "engagementYear"
         FROM "Project" WHERE id = $1`, id
      ).then(rows => rows.map(r => ({ ...r, dataClassification: 'C3', criticality: 'silver', engagementType: 'external' })))
    ),
  ]);

  if (!project) notFound();

  const rawExtra = (rawRows[0] ?? {}) as Record<string, string>;
  const projectWithRaw = {
    ...project,
    members: rawExtra.members ?? '[]',
    targetCode: rawExtra.targetCode ?? '',
    engagementYear: rawExtra.engagementYear ?? '',
    dataClassification: rawExtra.dataClassification ?? 'C3',
    criticality: rawExtra.criticality ?? 'silver',
    engagementType: rawExtra.engagementType ?? 'external',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Projects', project.name, 'Edit']}
        title="Edit Project"
        subtitle={`${project.code}`}
        actions={
          <Link href={`/projects/${id}`} className="btn btn-ghost btn-sm">
            <Ico name="chevLeft" size={14} />
            Cancel
          </Link>
        }
      />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '32px 28px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <EditProjectForm project={projectWithRaw as any} users={users} />
        </div>
      </div>
    </div>
  );
}
