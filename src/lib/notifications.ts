/* ── Teams Webhook Notifications ──────────────────────────────────────────── */

import { sendWebhook } from '@/lib/webhook';
import { db } from '@/lib/db';

export async function getTeamsWebhookUrl(): Promise<string | null> {
  // Kept for backwards-compat; sendWebhook reads the URL itself
  try {
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "AppSetting" WHERE key = 'teamsWebhookUrl'`
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
  webhookUrl: string; // kept for compat, sendWebhook reads its own URL
  mentionedUsers: MentionedUser[];
  commenterName: string;
  findingTitle: string;
  projectName: string;
  projectId: string;
  findingId: string;
  commentContent: string;
}) {
  if (params.mentionedUsers.length === 0) return;

  const mentionList = params.mentionedUsers.map(u => `<b>${u.name}</b>`).join(', ');
  const preview = params.commentContent.length > 200
    ? params.commentContent.substring(0, 200) + '…'
    : params.commentContent;
  const ts = new Date().toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  sendWebhook(
    `💬 <b>AEGIS — New Mention in Comment</b><br><br>` +
    `👤 <b>Mentioned:</b> ${mentionList}<br>` +
    `✍️ <b>By:</b> <b>${params.commenterName}</b><br>` +
    `🔍 <b>Finding:</b> ${params.findingTitle}<br>` +
    `📋 <b>Project:</b> ${params.projectName}<br>` +
    `🕐 <b>Time:</b> ${ts}<br><br>` +
    `<i>"${preview}"</i>`
  );
}
