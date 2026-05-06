import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { EditProjectForm } from './EditProjectForm';

type Props = { params: Promise<{ id: string }> };

export default async function EditProjectPage({ params }: Props) {
  const { id } = await params;

  const [project, users, rawRows] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: { lead: true },
    }),
    db.user.findMany({ select: { id: true, name: true, email: true, role: true, team: true } }),
    db.$queryRawUnsafe<Record<string, string>[]>(
      `SELECT members FROM "Project" WHERE id = $1`, id
    ),
  ]);

  if (!project) notFound();

  const rawExtra = rawRows[0] ?? {};
  const projectWithRaw = { ...project, members: rawExtra.members ?? '[]' };

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
