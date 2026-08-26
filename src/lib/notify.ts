/**
 * Notification helper — creates in-app notifications and (optionally) pings
 * the configured webhook. Used by:
 *   - comment route, when a mention is parsed
 *   - finding PATCH, when status / severity / assignee changes (notifies watchers)
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { sendWebhook } from './webhook';
import { broadcast } from './broadcaster';

export type NotificationType =
  | 'mention'
  | 'watch_status'
  | 'watch_severity'
  | 'watch_comment'
  | 'watch_assigned'
  | 'sla_breach_soon'
  | 'sla_overdue';

export interface CreateNotificationOpts {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  actorId?: string | null;
  findingId?: string | null;
  /** Suppress self-notifications (e.g. you commented and mentioned yourself). */
  skipSelf?: boolean;
  /** Also fire the configured webhook (default false — keeps webhook for prod alerts). */
  webhook?: boolean;
}

export async function createNotification(opts: CreateNotificationOpts): Promise<void> {
  if (opts.skipSelf && opts.actorId === opts.userId) return;
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "Notification" (id, "userId", type, title, body, link, "actorId", "findingId", read, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())`,
      uuidv4(),
      opts.userId,
      opts.type,
      opts.title,
      opts.body ?? '',
      opts.link ?? '',
      opts.actorId ?? null,
      opts.findingId ?? null,
    );
    if (opts.webhook) {
      sendWebhook(`🔔 <b>${opts.title}</b>${opts.body ? `<br>${opts.body}` : ''}`);
    }
    // Push a real-time ping to the recipient's personal SSE channel so the
    // sidebar badge + any open inbox update instantly (no 30s poll wait).
    broadcast(`user:${opts.userId}`, {
      type: 'notify',
      n: { type: opts.type, title: opts.title, body: opts.body ?? '', link: opts.link ?? '' },
      ts: Date.now(),
    });
  } catch (err) {
    console.warn('[notify] insert failed', err);
  }
}

/** Bulk-create notifications for a list of recipients (de-duped). */
export async function notifyMany(
  userIds: string[],
  base: Omit<CreateNotificationOpts, 'userId'>,
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(unique.map(uid =>
    createNotification({ ...base, userId: uid })
  ));
}

/**
 * Extract @username tokens from a comment body. Returns an array of resolved
 * user IDs (any token that doesn't match a known user is dropped silently).
 */
export async function resolveMentions(content: string): Promise<{ ids: string[]; names: string[] }> {
  const tokens = Array.from(content.matchAll(/@([a-zA-Z0-9._-]+)/g)).map(m => m[1]);
  if (tokens.length === 0) return { ids: [], names: [] };

  // Match against email-localpart, full name, or initials (case-insensitive)
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, initials: true },
  });
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const tok of tokens) {
    const t = tok.toLowerCase();
    const hit = users.find(u =>
      u.email.split('@')[0].toLowerCase() === t ||
      u.name.toLowerCase().replace(/\s+/g, '') === t.replace(/\s+/g, '') ||
      u.name.toLowerCase().split(/\s+/)[0] === t ||
      u.initials.toLowerCase() === t,
    );
    if (hit) {
      ids.add(hit.id);
      names.add(hit.name);
    }
  }
  return { ids: Array.from(ids), names: Array.from(names) };
}

/** List the userIds watching a given finding. */
export async function getWatcherIds(findingId: string): Promise<string[]> {
  try {
    const rows = await db.$queryRawUnsafe<{ userId: string }[]>(
      `SELECT "userId" FROM "FindingWatcher" WHERE "findingId" = $1`, findingId,
    );
    return rows.map(r => r.userId);
  } catch {
    return [];
  }
}
