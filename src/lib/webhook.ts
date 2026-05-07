import { db } from './db';

export async function sendWebhook(text: string) {
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value FROM "AppSetting" WHERE key = 'teamsWebhookUrl'`
  );
  const url = rows[0]?.value?.trim();
  if (!url) return;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: text }),
  }).catch(err => console.error('[webhook]', err));
}
