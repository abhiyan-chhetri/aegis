/**
 * Teams webhook sender.
 *
 * Goals:
 *  1. Work behind self-signed certs / internal CAs / TLS-interception
 *     proxies. The previous version passed `agent` to Node fetch, but
 *     Node's fetch is undici and IGNORES `agent` — it needs `dispatcher`.
 *     That's why the webhook silently failed in corporate environments.
 *  2. Never block the caller — every error is logged and swallowed.
 *  3. Surface real error reasons (status code, body excerpt, TLS error
 *     name) in logs so admins can diagnose without recompiling.
 *
 * Strategy: try undici (Node fetch) with a relaxed dispatcher first;
 * if undici can't be loaded for any reason, fall back to the native
 * https / http modules with rejectUnauthorized:false. Either path
 * accepts self-signed certs.
 */
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { db } from './db';

// Always trust internal CAs / self-signed certs for outbound webhook
// destinations. Teams / Mattermost / generic POST endpoints behind
// corporate TLS interception otherwise silently fail.
const HTTPS_AGENT = new https.Agent({
  rejectUnauthorized: false,
  // Some old Teams gateways negotiate down — be permissive.
  minVersion: 'TLSv1',
  keepAlive: false,
});

let dispatcher: unknown | null = null;
async function getInsecureDispatcher() {
  if (dispatcher !== null) return dispatcher;
  try {
    // Lazy import — undici ships with Node but the type isn't always
    // resolvable depending on the build environment.
    // Loaded by string to dodge static type resolution — undici ships
    // with Node 18+ but isn't always declared in @types.
    const undici = await (Function('return import("undici")')() as Promise<unknown>).catch(() => null);
    if (!undici) {
      dispatcher = false; // sentinel: tried and failed
      return null;
    }
    const Agent = (undici as { Agent?: new (opts: unknown) => unknown }).Agent;
    if (!Agent) {
      dispatcher = false;
      return null;
    }
    dispatcher = new Agent({
      connect: {
        rejectUnauthorized: false,
        // accept any TLS version Teams might insist on
        minVersion: 'TLSv1',
      },
    });
    return dispatcher;
  } catch {
    dispatcher = false;
    return null;
  }
}

/** POST `{ data: text }` to the configured Teams webhook URL, tolerating
 *  self-signed certs. Returns a small result object — callers usually
 *  fire-and-forget but tests / admin "Send test webhook" buttons may want
 *  to inspect it.
 */
export async function sendWebhook(text: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  let url: string | undefined;
  try {
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "AppSetting" WHERE key = 'teamsWebhookUrl'`
    );
    url = rows[0]?.value?.trim();
  } catch (err) {
    console.warn('[webhook] failed to read AppSetting:', (err as Error).message);
    return { ok: false, error: 'config-read-failed' };
  }
  if (!url) return { ok: false, error: 'no-url' };

  const body = JSON.stringify({ data: text });
  const headers = { 'Content-Type': 'application/json' };

  // ── Attempt 1: undici fetch with insecure dispatcher ─────────────────
  try {
    const d = await getInsecureDispatcher();
    if (d) {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        // undici-specific option, lets us bypass cert validation
        // without polluting NODE_TLS_REJECT_UNAUTHORIZED globally.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatcher: d as any,
      } as RequestInit);
      if (res.ok) return { ok: true, status: res.status };
      const text = await res.text().catch(() => '');
      console.warn('[webhook] non-2xx response', res.status, text.slice(0, 200));
      // fall through to https-module fallback in case it's an undici-specific issue
    }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; name?: string } };
    console.warn('[webhook] undici fetch failed:', e?.message, e?.cause?.code || e?.cause?.name || '');
    // fall through
  }

  // ── Attempt 2: native https / http module (always trusts self-signed) ─
  try {
    return await sendViaNodeHttp(url, body, headers);
  } catch (err) {
    const e = err as Error;
    console.error('[webhook] all transports failed:', e?.message);
    return { ok: false, error: e?.message || 'send-failed' };
  }
}

function sendViaNodeHttp(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(rawUrl); } catch (e) {
      reject(new Error(`Invalid webhook URL: ${(e as Error).message}`));
      return;
    }
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body).toString(),
      },
      // The whole point of this module: always trust the cert.
      ...(isHttps ? { agent: HTTPS_AGENT, rejectUnauthorized: false } : {}),
      // Keep this snappy — don't hang if the proxy black-holes us.
      timeout: 10_000,
    }, res => {
      let buf = '';
      res.on('data', chunk => { buf += chunk; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (status >= 200 && status < 300) {
          resolve({ ok: true, status });
        } else {
          console.warn('[webhook] node https non-2xx', status, buf.slice(0, 200));
          resolve({ ok: false, status, error: buf.slice(0, 200) });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err: Error & { code?: string }) => {
      console.error('[webhook] node https error:', err.message, err.code || '');
      reject(err);
    });
    req.write(body);
    req.end();
  });
}
