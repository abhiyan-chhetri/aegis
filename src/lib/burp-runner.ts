/**
 * Aegis payload runner — executes checklist payloads against the captured
 * endpoints (mini-Intruder) and AUTO-DETECTS the result from the response:
 *  - reflection: payload echoed back unencoded (XSS / injection confirmation)
 *  - error: SQL / stack / exception patterns in the response
 *  - timing: slow responses for sleep/benchmark payloads (blind signal)
 * Confirmed items flip to SUCCEEDED with the evidence; run-but-clean items
 * become TESTED so coverage reflects that they were actually tried.
 */
import { db } from './db';
import { safeJson, normalizePath } from './burp';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection',
  'te', 'trailer', 'content-length', 'accept-encoding', 'expect',
]);

const ERROR_PATTERNS = [
  /(SQLSTATE|syntax error at or near|You have an error in your SQL|ORA-\d{5}|PostgreSQL|SQLite3|mysql_|Incorrect syntax near)/i,
  /(Traceback \(most recent call last\)|\.cs:line \d+|\.java:\d+|at com\.|at org\.|at java\.|Fatal error|Unhandled|Exception in thread)/i,
  /(org\.springframework|org\.apache|java\.lang\.|System\.Exception|Undefined variable|Warning:)/i,
];
const TIMING_PAYLOAD = /(sleep|waitfor|benchmark|pg_sleep|sleep\(|%73leep)/i;

export interface RunnerRun {
  itemId?: string;
  payload: string;
  endpointId?: string;
}

export interface RunnerResult {
  itemId?: string;
  ok: boolean;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  reflected: boolean;
  error: boolean;
  timing: boolean;
  responsePreview: string;
  errorMsg?: string;
}

interface EndpointSample {
  method: string;
  url: string;
  requestHeaders: string;
  requestBody: string;
}

async function loadSample(projectId: string, endpointId: string): Promise<EndpointSample | null> {
  const ep = await db.$queryRawUnsafe<{ method: string; host: string; path: string }[]>(
    `SELECT method, host, path FROM "BurpEndpoint" WHERE id = $1 AND "projectId" = $2`,
    endpointId, projectId,
  );
  if (!ep[0]) return null;
  const wantPath = ep[0].path; // normalized, e.g. /api/users/:id
  const rows = await db.$queryRawUnsafe<Array<{ "pathNoQuery": string; method: string; url: string; "requestHeaders": string; "requestBody": string }>>(
    `SELECT "pathNoQuery", method, url, "requestHeaders", "requestBody" FROM "BurpTraffic"
     WHERE "projectId" = $1 AND host = $2 AND method = $3
     ORDER BY "createdAt" DESC LIMIT 30`,
    projectId, ep[0].host, ep[0].method,
  ).catch(() => []);
  const match = rows.find(r => normalizePath(r.pathNoQuery) === wantPath);
  if (match) return { method: match.method, url: match.url, requestHeaders: match.requestHeaders, requestBody: match.requestBody };
  if (rows[0]) return { method: rows[0].method, url: rows[0].url, requestHeaders: rows[0].requestHeaders, requestBody: rows[0].requestBody };
  return null;
}

/** Latest exchange marked as the session anchor for this project. */
async function loadSession(projectId: string): Promise<{ cookie?: string; authorization?: string } | null> {
  const rows = await db.$queryRawUnsafe<{ "requestHeaders": string }[]>(
    `SELECT "requestHeaders" FROM "BurpTraffic"
     WHERE "projectId" = $1 AND "isSession" = true AND "scopeOk" = true
     ORDER BY "createdAt" DESC LIMIT 1`,
    projectId,
  );
  const h = safeJson<Record<string, string>>(rows[0]?.requestHeaders, {});
  const cookie = h.cookie || h['set-cookie'];
  const authorization = h.authorization;
  if (!cookie && !authorization) return null;
  return { cookie, authorization };
}

/** Inject the payload into a copy of the request at a probe position. */
function buildRequest(sample: EndpointSample, payload: string, session: { cookie?: string; authorization?: string } | null): { method: string; url: string; headers: Record<string, string>; body: string } {
  const headers = safeJson<Record<string, string>>(sample.requestHeaders, {});
  const outHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || lk.startsWith('x-')) continue;
    outHeaders[k] = v;
  }
  if (session?.cookie) outHeaders['Cookie'] = session.cookie;
  if (session?.authorization) outHeaders['Authorization'] = session.authorization;

  const method = (sample.method || 'GET').toUpperCase();
  let url = sample.url;
  let body = sample.requestBody || '';

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    try {
      const u = new URL(sample.url);
      const params = [...u.searchParams.keys()];
      if (params.length > 0) {
        // Replace the first existing parameter's value — most likely reflected.
        const first = params[0];
        u.searchParams.set(first, payload);
      } else {
        u.searchParams.set('q', payload);
      }
      url = u.toString();
    } catch { url = sample.url + (sample.url.includes('?') ? '&' : '?') + `q=${encodeURIComponent(payload)}`; }
  } else if (body.trim()) {
    const lower = body.trimStart().toLowerCase();
    if (lower.startsWith('{') || lower.startsWith('[')) {
      // JSON — inject a probe field (best effort; keep valid JSON).
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsed.aegis_probe = payload;
          body = JSON.stringify(parsed);
          if (!outHeaders['Content-Type']) outHeaders['Content-Type'] = 'application/json';
        } else {
          body += (body.endsWith('\n') ? '' : '\n') + `aegis_probe=${encodeURIComponent(payload)}`;
        }
      } catch {
        body += (body.endsWith('\n') ? '' : '\n') + `aegis_probe=${encodeURIComponent(payload)}`;
      }
    } else if (/content-type.*form/i.test(Object.entries(outHeaders).map(([k, v]) => `${k}:${v}`).join('\n'))) {
      body += (body.endsWith('&') || !body ? '' : '&') + `aegis_probe=${encodeURIComponent(payload)}`;
    } else {
      body += (body.endsWith('\n') ? '' : '\n') + `aegis_probe=${encodeURIComponent(payload)}`;
    }
  } else {
    body = `aegis_probe=${encodeURIComponent(payload)}`;
    if (!outHeaders['Content-Type']) outHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  return { method, url, headers: outHeaders, body };
}

/** Run one payload and auto-detect the outcome. */
export async function runSingle(
  projectId: string,
  endpointId: string,
  payload: string,
  useSession: boolean,
): Promise<RunnerResult> {
  const sample = await loadSample(projectId, endpointId);
  if (!sample) {
    return {
      ok: false, method: '', url: '', statusCode: 0, durationMs: 0,
      reflected: false, error: false, timing: false, responsePreview: '',
      errorMsg: 'no captured request available for this endpoint — capture traffic first',
    };
  }
  const session = useSession ? await loadSession(projectId) : null;
  const req = buildRequest(sample, payload, session);

  const started = Date.now();
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body || undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    const buf = await res.arrayBuffer();
    const bodyText = Buffer.from(buf).toString('utf8');
    const durationMs = Date.now() - started;

    const reflected = payload.length >= 6 && bodyText.toLowerCase().includes(payload.toLowerCase());
    const error = ERROR_PATTERNS.some(re => re.test(bodyText.slice(0, 12000)));
    const timing = durationMs > 3500 && TIMING_PAYLOAD.test(payload);

    return {
      ok: true,
      method: req.method,
      url: req.url,
      statusCode: res.status,
      durationMs,
      reflected,
      error,
      timing,
      responsePreview: bodyText.slice(0, 2000),
    };
  } catch (e) {
    return {
      ok: false,
      method: req.method,
      url: req.url,
      statusCode: 0,
      durationMs: Date.now() - started,
      reflected: false, error: false, timing: false,
      responsePreview: '',
      errorMsg: e instanceof Error ? e.message : 'network error',
    };
  }
}

/** Run checklist items (or raw payloads) and update item statuses. */
export async function runChecklistItems(
  projectId: string,
  runs: RunnerRun[],
  opts: { useSession?: boolean } = {},
): Promise<RunnerResult[]> {
  const useSession = opts.useSession ?? true;
  const results: RunnerResult[] = [];

  for (const run of runs.slice(0, 15)) {
    let endpointId = run.endpointId;
    let item: { id: string; payload: string; endpointId: string | null } | null = null;
    if (run.itemId) {
      const rows = await db.$queryRawUnsafe<Array<{ id: string; payload: string; endpointId: string | null }>>(
        `SELECT id, payload, "endpointId" FROM "BurpChecklistItem" WHERE id = $1 AND "projectId" = $2`,
        run.itemId, projectId,
      );
      item = rows[0] ?? null;
      if (!item) { results.push({ ok: false, method: '', url: '', statusCode: 0, durationMs: 0, reflected: false, error: false, timing: false, responsePreview: '', errorMsg: 'checklist item not found' }); continue; }
      endpointId = item.endpointId || endpointId;
    }
    if (!endpointId) { results.push({ ok: false, method: '', url: '', statusCode: 0, durationMs: 0, reflected: false, error: false, timing: false, responsePreview: '', errorMsg: 'no endpoint for this item' }); continue; }

    const payload = run.payload || item?.payload || '';
    if (!payload) { results.push({ ok: false, method: '', url: '', statusCode: 0, durationMs: 0, reflected: false, error: false, timing: false, responsePreview: '', errorMsg: 'no payload' }); continue; }

    const result = await runSingle(projectId, endpointId, payload, useSession);

    if (item) {
      if (!result.ok) {
        // Request never reached the target — don't mark as tested, just note it.
        await db.$executeRawUnsafe(
          `UPDATE "BurpChecklistItem" SET "resultNote" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
          `Aegis runner could not reach the target: ${result.errorMsg || 'network error'}`.slice(0, 500),
          item.id,
        );
      } else {
        const confirmed = result.reflected || result.error || result.timing;
        const note = confirmed
          ? `Confirmed by Aegis runner: HTTP ${result.statusCode}, ${result.durationMs}ms — reflected=${result.reflected}, error=${result.error}, timing=${result.timing}`
          : `Ran via Aegis runner: HTTP ${result.statusCode}, ${result.durationMs}ms — no reflection/error observed`;
        await db.$executeRawUnsafe(
          `UPDATE "BurpChecklistItem" SET status = $1, "resultNote" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
          confirmed ? 'succeeded' : 'tested', note.slice(0, 1000), item.id,
        );
        if (endpointId) {
          await db.$executeRawUnsafe(
            `UPDATE "BurpEndpoint" SET "testedCount" = "testedCount" + 1, "succeededCount" = "succeededCount" + ${confirmed ? 1 : 0} WHERE id = $1`,
            endpointId,
          );
        }
      }
    }

    results.push({ ...result, itemId: run.itemId });
  }
  return results;
}
