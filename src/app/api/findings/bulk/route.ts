/**
 * PATCH /api/findings/bulk
 *
 * Apply the same field update to N findings at once. Triggered by the
 * library page's checkbox column. Returns counts of touched / skipped rows.
 *
 * Body shape:
 *   { ids: string[], data: { status?, severity?, assigneeId? } }
 *
 * Whitelisted fields keep the surface area small — anything else is ignored.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notifyMany, getWatcherIds } from '@/lib/notify';

const ALLOWED_SEVERITY = ['critical', 'high', 'medium', 'low', 'info'];
const ALLOWED_STATUS = ['open', 'in-progress', 'in-review', 'resolved', 'accepted'];

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as
    | { ids: string[]; data: { status?: string; severity?: string; assigneeId?: string | null } }
    | null;
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.data?.status && ALLOWED_STATUS.includes(body.data.status)) data.status = body.data.status;
  if (body.data?.severity && ALLOWED_SEVERITY.includes(body.data.severity)) data.severity = body.data.severity;
  if (body.data && 'assigneeId' in body.data) {
    data.assigneeId = body.data.assigneeId ?? null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields in data' }, { status: 400 });
  }

  // Load before-state so we can notify watchers about what specifically moved
  const before = await db.finding.findMany({
    where: { id: { in: body.ids } },
    select: { id: true, status: true, severity: true, assigneeId: true, title: true, code: true, projectId: true },
  });

  const result = await db.finding.updateMany({
    where: { id: { in: body.ids } },
    data,
  });

  // Notify watchers asynchronously — don't block the response
  void (async () => {
    for (const f of before) {
      const changes: string[] = [];
      let notifType: 'watch_status' | 'watch_severity' | 'watch_assigned' = 'watch_status';
      if (typeof data.status === 'string' && data.status !== f.status) {
        changes.push(`status: ${f.status} → ${data.status}`);
        notifType = 'watch_status';
      }
      if (typeof data.severity === 'string' && data.severity !== f.severity) {
        changes.push(`severity: ${f.severity} → ${data.severity}`);
        notifType = 'watch_severity';
      }
      if ('assigneeId' in data && data.assigneeId !== f.assigneeId) {
        changes.push(`assignee changed`);
        notifType = 'watch_assigned';
      }
      if (changes.length === 0) continue;
      const watchers = await getWatcherIds(f.id);
      if (watchers.length === 0) continue;
      await notifyMany(watchers, {
        type: notifType,
        title: `[${f.code}] ${f.title}`,
        body: changes.join(' · '),
        link: `/projects/${f.projectId}/findings/${f.id}`,
        actorId: session.id,
        findingId: f.id,
        skipSelf: true,
      });
    }
  })();

  return NextResponse.json({ ok: true, count: result.count });
}
