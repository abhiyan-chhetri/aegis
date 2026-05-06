/* ── Teams Webhook Notifications ──────────────────────────────────────────── */

import { db } from '@/lib/db';

export async function getTeamsWebhookUrl(): Promise<string | null> {
  try {
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM AppSetting WHERE key = 'teamsWebhookUrl'`
    );
    return rows[0]?.value || null;
  } catch {
    return null;
  }
}

interface MentionedUser {
  id: string;
  name: string;
}

export async function notifyMention(params: {
  webhookUrl: string;
  mentionedUsers: MentionedUser[];
  commenterName: string;
  findingTitle: string;
  projectName: string;
  projectId: string;
  findingId: string;
  commentContent: string;
}) {
  if (!params.webhookUrl || params.mentionedUsers.length === 0) return;

  const mentionList = params.mentionedUsers.map(u => u.name).join(', ');
  const message = `@${mentionList}: ${params.commenterName} mentioned you on "${params.findingTitle}" in ${params.projectName}\n\n"${params.commentContent.substring(0, 200)}${params.commentContent.length > 200 ? '...' : ''}"`;

  try {
    const res = await fetch(params.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      console.warn('[Teams webhook failed]', res.status, await res.text());
    }
  } catch (err) {
    console.warn('[Teams webhook error]', err);
  }
}
