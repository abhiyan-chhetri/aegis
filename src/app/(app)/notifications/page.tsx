/**
 * /notifications — full notification inbox.
 *
 * Lists every notification for the current user (mentions, watcher events,
 * SLA breaches). Server-component fetches the data and hands off to the
 * client for read/unread toggling and bulk actions.
 */
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { NotificationsClient } from './NotificationsClient';

interface Row {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: Date;
  actorName: string | null;
  actorInitials: string | null;
  findingId: string | null;
}

export default async function NotificationsPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect('/login');

  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT n.id, n.type, n.title, n.body, n.link, n.read, n."createdAt",
            u.name AS "actorName", u.initials AS "actorInitials",
            n."findingId"
     FROM "Notification" n
     LEFT JOIN "User" u ON u.id = n."actorId"
     WHERE n."userId" = $1
     ORDER BY n."createdAt" DESC
     LIMIT 300`,
    session.id,
  ).catch(() => [] as Row[]);

  const unreadCount = rows.filter(r => !r.read).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Notifications']}
        title="Notifications"
        subtitle={`${unreadCount} unread / ${rows.length} total`}
      />
      <NotificationsClient initial={rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
    </div>
  );
}
