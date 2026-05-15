import https from 'https';
import http from 'http';
import { db } from './db';

// Accept self-signed / internal-CA certificates on webhook destinations
const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

export async function sendWebhook(text: string) {
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value FROM "AppSetting" WHERE key = 'teamsWebhookUrl'`
  );
  const url = rows[0]?.value?.trim();
  if (!url) return;

  const isHttps = url.startsWith('https://');
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: text }),
    // @ts-expect-error — Node.js fetch accepts agent for self-signed certs
    agent: isHttps ? HTTPS_AGENT : new http.Agent(),
  }).catch(err => console.error('[webhook]', err));
}
