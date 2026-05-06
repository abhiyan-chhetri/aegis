import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getTeamsWebhookUrl, notifyMention } from '@/lib/notifications';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: findingId } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT fc.id, fc.content, fc.mentions, fc."createdAt",
              u.id as "userId", u.name as "userName", u.initials as "userInitials"
       FROM "FindingComment" fc
       JOIN "User" u ON u.id = fc."userId"
       WHERE fc."findingId" = $1
       ORDER BY fc."createdAt" ASC`,
      findingId
    );

    const comments = rows.map((r) => ({
      id: r.id,
      content: r.content,
      mentions: r.mentions,
      createdAt: r.createdAt,
      user: { id: r.userId, name: r.userName, initials: r.userInitials },
    }));

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('[GET /api/findings/[id]/comments]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: findingId } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { content, mentions } = await request.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.$executeRawUnsafe(
      `INSERT INTO "FindingComment" (id, "findingId", "userId", content, mentions, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      id, findingId, session.id, content.trim(),
      JSON.stringify(mentions || []), now, now
    );

    const [row] = await db.$queryRawUnsafe<any[]>(
      `SELECT fc.id, fc.content, fc.mentions, fc."createdAt",
              u.id as "userId", u.name as "userName", u.initials as "userInitials"
       FROM "FindingComment" fc
       JOIN "User" u ON u.id = fc."userId"
       WHERE fc.id = $1`,
      id
    );

    const comment = {
      id: row.id,
      content: row.content,
      mentions: row.mentions,
      createdAt: row.createdAt,
      user: { id: row.userId, name: row.userName, initials: row.userInitials },
    };

    // Log activity for comment
    (async () => {
      try {
        const finding = await db.finding.findUnique({
          where: { id: findingId },
          select: { id: true, title: true, projectId: true },
        });
        if (finding) {
          // Get first 150 chars of comment, remove newlines for cleaner display
          const commentPreview = content.substring(0, 150).replace(/\n/g, ' ').trim();
          await db.activity.create({
            data: {
              userId: session.id,
              findingId,
              projectId: finding.projectId,
              action: 'commented',
              target: finding.title,
              detail: commentPreview,
              badge: 'COMMENT',
            },
          });
        }
      } catch (logErr) {
        console.warn('[activity log skipped]', logErr);
      }
    })();

    // Send Teams notification if there are mentions (best-effort, don't block response)
    (async () => {
      try {
        const webhookUrl = await getTeamsWebhookUrl();
        if (!webhookUrl || !mentions || mentions.length === 0) return;

        const finding = await db.finding.findUnique({ where: { id: findingId }, select: { title: true, projectId: true } });
        if (!finding) return;

        const project = await db.project.findUnique({ where: { id: finding.projectId }, select: { name: true } });
        if (!project) return;

        const mentionedIds = mentions as string[];
        const mentionedUsers = await db.user.findMany({ where: { id: { in: mentionedIds } }, select: { id: true, name: true } });

        if (mentionedUsers.length > 0) {
          await notifyMention({
            webhookUrl,
            mentionedUsers,
            commenterName: session.name || 'Someone',
            findingTitle: finding.title,
            projectName: project.name,
            projectId: finding.projectId,
            findingId,
            commentContent: content,
          });
        }
      } catch (notifyErr) {
        console.warn('[mention notification skipped]', notifyErr);
      }
    })();

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/findings/[id]/comments]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
