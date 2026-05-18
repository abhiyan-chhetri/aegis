/**
 * POST /api/webhook-test
 *
 * Routes the "Send test webhook" button through the server so it goes
 * via the same TLS-permissive transport as real notifications. Without
 * this, the browser's strict cert validation made testing impossible
 * for self-signed / internal-CA Teams gateways.
 *
 * Body (optional): { url?: string, text?: string }
 *   - url: override the configured webhook URL (lets admins test before saving)
 *   - text: override the message
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendWebhook } from '@/lib/webhook';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { url?: string; text?: string };
  const overrideUrl = typeof body.url === 'string' ? body.url.trim() : '';
  const message = (body.text && String(body.text).slice(0, 1000))
    || '✅ Aegis webhook connection successful!';

  // If the admin supplied a candidate URL, send via the same insecure
  // node-https path that sendWebhook uses internally — without writing
  // anything to AppSetting. Otherwise use the configured URL.
  if (overrideUrl) {
    try {
      const result = await sendDirect(overrideUrl, message);
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    } catch (err) {
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
    }
  }

  // No override → check there IS a configured URL, then use sendWebhook
  const rows = await db.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value FROM "AppSetting" WHERE key = 'teamsWebhookUrl'`,
  );
  const stored = rows[0]?.value?.trim();
  if (!stored) {
    return NextResponse.json({ ok: false, error: 'No webhook URL configured' }, { status: 400 });
  }
  const result = await sendWebhook(message);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

// Mini direct sender for the "test before saving" path. Identical TLS
// behaviour to lib/webhook.ts.
function sendDirect(rawUrl: string, text: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  return new Promise(resolve => {
    let u: URL;
    try { u = new URL(rawUrl); } catch (e) {
      resolve({ ok: false, error: `Invalid URL: ${(e as Error).message}` });
      return;
    }
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const body = JSON.stringify({ data: text });
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
      },
      ...(isHttps ? { rejectUnauthorized: false } : {}),
      timeout: 10_000,
    }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (status >= 200 && status < 300) resolve({ ok: true, status });
        else resolve({ ok: false, status, error: buf.slice(0, 300) || `HTTP ${status}` });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout after 10s')));
    req.on('error', (err: Error) => resolve({ ok: false, error: err.message }));
    req.write(body);
    req.end();
  });
}
