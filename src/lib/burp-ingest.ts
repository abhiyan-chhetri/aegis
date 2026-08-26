/**
 * Burp Bridge ingest pipeline — validates events, enforces the scope guard,
 * dedupes, runs anomaly + secret scanning, upserts the endpoint inventory,
 * auto-marks Repeater/Intruder-tested checklist items, and broadcasts the
 * live activity stream.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { broadcast } from './broadcaster';
import {
  BurpTrafficEvent, AnomalyFlag, SecretHit, MAX_BATCH, MAX_BODY_BYTES, MAX_HEADERS,
  parseUrl, normalizePath, sha256Hex,
  isHostInScope, detectAnomalies, scanSecrets, safeJson,
  headersToRecord, recordToHeadersString,
} from './burp';

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: Array<{ host: string; reason: string }>;
  droppedByRules: number;
  endpointsUpdated: number;
  autoMarked: number;
}

interface CaptureRules {
  dropHosts?: string[];
  onlyTools?: string[];
  dropStatic?: boolean;
}

let ingestCounter = 0;

function truncateBody(body: string | undefined): { text: string; truncated: boolean } {
  if (!body) return { text: '', truncated: false };
  const buf = Buffer.from(body, 'utf8');
  if (buf.length <= MAX_BODY_BYTES) return { text: body, truncated: false };
  return { text: buf.slice(0, MAX_BODY_BYTES).toString('utf8'), truncated: true };
}

function capHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(h)) {
    if (n++ >= MAX_HEADERS) break;
    out[k] = v;
  }
  return out;
}

function mergeStatusCodes(existing: number[], code: number): number[] {
  const arr = [...(Array.isArray(existing) ? existing : [])];
  if (code > 0 && !arr.includes(code)) arr.push(code);
  return arr.slice(-20);
}

function mergeAnomalies(existing: AnomalyFlag[], flags: AnomalyFlag[]): AnomalyFlag[] {
  const seen = new Set<string>();
  const arr = (Array.isArray(existing) ? existing : []).filter(a => {
    if (seen.has(a.type)) return false;
    seen.add(a.type);
    return true;
  });
  for (const f of flags) {
    if (!seen.has(f.type)) { arr.push(f); seen.add(f.type); }
  }
  return arr.slice(-30);
}

interface ParsedEvent {
  method: string;
  url: string;
  host: string;
  pathNoQuery: string;
  query: string;
  path: string;
  statusCode: number;
  contentType: string;
  tool: string;
  reqHeaders: Record<string, string>;
  resHeaders: Record<string, string>;
  reqBody: { text: string; truncated: boolean };
  resBody: { text: string; truncated: boolean };
  anomalies: AnomalyFlag[];
  secrets: SecretHit[];
  isJsAsset: boolean;
  createdAt: Date;
  normPath: string;
  dedupKey: string;
}

/**
 * Process a batch of traffic events for a project. Assumes the engagement key
 * was already verified. Returns counts; throws on hard validation failure.
 */
export async function processIngestBatch(
  projectId: string,
  project: { burpScope: string; burpRetentionDays: number; burpCaptureRules?: string },
  events: BurpTrafficEvent[],
): Promise<IngestResult> {
  if (!Array.isArray(events)) throw new Error('events must be an array');
  if (events.length > MAX_BATCH) throw new Error(`batch too large (max ${MAX_BATCH})`);

  // ── Capture rules (per-project ingest filters) ─────────────────────────────
  let rules: CaptureRules = {};
  try { rules = safeJson<CaptureRules>(project.burpCaptureRules || '{}', {}); } catch { /* ignore */ }
  const onlyTools = (rules.onlyTools || []).filter(Boolean).map(t => String(t).toLowerCase());
  const dropHosts = (rules.dropHosts || []).filter(Boolean).map(h => String(h).toLowerCase().replace(/^https?:\/\//, '').split(':')[0]);
  const dropStatic = rules.dropStatic === true;
  const STATIC_EXT_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|css|woff2?|ttf|otf|eot|mp[34]|webm|ogg|wav|pdf|zip|gz|tar|7z|exe|dmg|bin)$/i;

  const result: IngestResult = { accepted: 0, duplicates: 0, rejected: [], droppedByRules: 0, endpointsUpdated: 0, autoMarked: 0 };
  const parsed: ParsedEvent[] = [];

  for (const raw of events) {
    const method = String(raw.method || 'GET').toUpperCase().slice(0, 12);
    const url = String(raw.url || '').trim();
    if (!url) { result.rejected.push({ host: '—', reason: 'missing url' }); continue; }

    const { host, pathNoQuery, query, path } = parseUrl(url);
    if (!host) { result.rejected.push({ host, reason: 'unparseable url' }); continue; }

    const statusCode = Number(raw.statusCode) || 0;
    const tool = String(raw.tool || 'proxy').toLowerCase().slice(0, 20);

    // ── Capture rules (drop noise before anything else) ──────────────────────
    if (onlyTools.length > 0 && !onlyTools.includes(tool.toLowerCase())) { result.droppedByRules++; continue; }
    if (dropHosts.includes(host.toLowerCase().split(':')[0])) { result.droppedByRules++; continue; }
    if (dropStatic && STATIC_EXT_RE.test(pathNoQuery)) { result.droppedByRules++; continue; }

    const createdAt = raw.timestamp && !isNaN(Date.parse(raw.timestamp))
      ? new Date(raw.timestamp)
      : new Date();

    // ── Scope guard ──────────────────────────────────────────────────────────
    if (!isHostInScope(host, project.burpScope)) {
      result.rejected.push({ host, reason: 'host not in declared Burp scope' });
      // Record the attempt (scopeOk=false) so the guard's activity is visible;
      // it is excluded from the default traffic list.
      try {
        await db.$queryRawUnsafe(
          `INSERT INTO "BurpTraffic"
            (id, "projectId", sha256, method, url, host, path, "pathNoQuery", query,
             "statusCode", "contentType", tool, "sizeBytes", truncated, "scopeOk",
             anomalies, secrets, "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'', $11, 0, false, false, $12, '[]', $13)
           ON CONFLICT ("projectId", sha256) DO NOTHING`,
          uuidv4(), projectId,
          sha256Hex(`${method}|${url}|out-of-scope`),
          method, url, host, path, pathNoQuery, query,
          statusCode, tool,
          JSON.stringify([{ type: 'out_of_scope', label: 'Rejected by scope guard', severity: 'low' }]),
          createdAt,
        );
      } catch { /* non-critical */ }
      continue;
    }

    const contentType = String(raw.contentType || '').slice(0, 200);

    const reqHeadersRaw = headersToRecord(raw.requestHeaders);
    const resHeadersRaw = headersToRecord(raw.responseHeaders);
    // Store headers RAW — cookies, Authorization and API keys are kept intact
    // because the team needs them for replay (server-side and via Burp), flow
    // reconstruction and re-testing. This is an internal authorized tool.
    const reqHeaders = { ...reqHeadersRaw };
    const resHeaders = { ...resHeadersRaw };

    const reqBody = truncateBody(raw.requestBody);
    const resBody = truncateBody(raw.responseBody);

    const anomalies = detectAnomalies({
      statusCode,
      contentType,
      pathNoQuery,
      query,
      requestBody: reqBody.text,
      requestHeaders: reqHeaders,
      responseHeaders: resHeaders,
      responseBody: resBody.text,
    });

    // Secret scan — JS assets and error-ish responses are the best targets.
    const isJsAsset = /(^|\/)([^/]+\.(js|mjs)(\?|$))/i.test(pathNoQuery) ||
      /javascript/i.test(contentType) ||
      anomalies.some(a => a.type === 'stack_trace' || a.type === 'debug_mode');
    const secrets: SecretHit[] = isJsAsset
      ? scanSecrets(`${reqBody.text}\n${resBody.text}`)
      : scanSecrets(resBody.text).slice(0, 20);

    parsed.push({
      method, url, host, pathNoQuery, query, path,
      statusCode, contentType, tool,
      reqHeaders: capHeaders(reqHeaders),
      resHeaders: capHeaders(resHeaders),
      reqBody, resBody,
      anomalies, secrets, isJsAsset,
      createdAt: raw.timestamp && !isNaN(Date.parse(raw.timestamp)) ? new Date(raw.timestamp) : new Date(),
      normPath: normalizePath(pathNoQuery),
      dedupKey: sha256Hex(`${method}|${url}|${reqBody.text}|${resBody.text}`),
    });
  }

  if (parsed.length === 0) return result;

  // ── Dedup: find which (projectId, sha256) already exist ────────────────────
  const keys = parsed.map(p => p.dedupKey);
  const existing = await db.$queryRawUnsafe<{ sha256: string }[]>(
    `SELECT sha256 FROM "BurpTraffic" WHERE "projectId" = $1 AND sha256 = ANY($2::text[])`,
    projectId, keys,
  );
  const existingSet = new Set(existing.map(r => r.sha256));
  const fresh = parsed.filter(p => !existingSet.has(p.dedupKey));
  result.duplicates = parsed.length - fresh.length;

  // ── Load existing endpoint rows for the batch (one query) ──────────────────
  const endpointKeys = fresh.map(p => `${p.method}\u0000${p.host}\u0000${p.normPath}`);
  const uniqueKeys = [...new Set(endpointKeys)];
  let existingEndpoints = new Map<string, { statusCodes: number[]; anomalies: AnomalyFlag[]; isJsAsset: boolean }>();
  if (uniqueKeys.length > 0) {
    const params: unknown[] = [projectId];
    const valuesSql = uniqueKeys.map((k, i) => {
      const [m, h, p] = k.split('\u0000');
      params.push(m, h, p);
      // Explicit casts — multi-row VALUES cannot infer types across tuples.
      return `($${i * 3 + 2}::text, $${i * 3 + 3}::text, $${i * 3 + 4}::text)`;
    }).join(', ');
    const rows = await db.$queryRawUnsafe<Array<{ method: string; host: string; path: string; "statusCodes": string; anomalies: string; "isJsAsset": boolean }>>(
      `SELECT method, host, path, "statusCodes", anomalies, "isJsAsset"
       FROM "BurpEndpoint"
       WHERE "projectId" = $1 AND (method, host, path) IN (VALUES ${valuesSql})`,
      ...params,
    );
    existingEndpoints = new Map(rows.map(r => [`${r.method}\u0000${r.host}\u0000${r.path}`, {
      statusCodes: safeJson<number[]>(r.statusCodes, []),
      anomalies: safeJson<AnomalyFlag[]>(r.anomalies, []),
      isJsAsset: r.isJsAsset,
    }]));
  }

  // ── Insert traffic (ONE multi-row statement per batch) + upsert endpoints ──
  const newTrafficIds: string[] = [];
  const seenEndpoints = new Map<string, string>(); // key → endpointId (per batch)
  const endpointAnomalyCount = new Map<string, number>();
  const endpointTestMarks = new Map<string, { tool: string; endpointId: string }>();
  const payloadCandidates = new Map<string, { url: string; text: string }[]>();
  const pathEndpoints = new Map<string, Set<string>>();
  let hasHtml = false;

  // Pre-generate ids so RETURNING can be mapped back to events.
  const freshIds = fresh.map(() => uuidv4());
  const freshParams: unknown[] = [];
  // NOTE: multi-row VALUES + ON CONFLICT can't infer param types across rows
  // (error 42P18), so every placeholder carries an explicit cast.
  const freshValues = fresh.map((p, i) => {
    const b = i * 22;
    freshParams.push(
      freshIds[i], projectId, p.dedupKey, p.method, p.url, p.host, p.path, p.pathNoQuery, p.query,
      p.statusCode, p.contentType,
      recordToHeadersString(p.reqHeaders), p.reqBody.text,
      recordToHeadersString(p.resHeaders), p.resBody.text,
      p.tool, p.reqBody.text.length + p.resBody.text.length,
      p.reqBody.truncated || p.resBody.truncated, true,
      JSON.stringify(p.anomalies), JSON.stringify(p.secrets), p.createdAt,
    );
    const o = i * 22;
    return `($${o + 1}::text,$${o + 2}::text,$${o + 3}::text,$${o + 4}::text,$${o + 5}::text,$${o + 6}::text,$${o + 7}::text,$${o + 8}::text,$${o + 9}::text,$${o + 10}::integer,$${o + 11}::text,$${o + 12}::text,$${o + 13}::text,$${o + 14}::text,$${o + 15}::text,$${o + 16}::text,$${o + 17}::integer,$${o + 18}::boolean,$${o + 19}::boolean,$${o + 20}::text,$${o + 21}::text,$${o + 22}::timestamp)`;
  });

  let insertedRows: Array<{ id: string }> = [];
  if (fresh.length > 0) {
    insertedRows = await db.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "BurpTraffic"
        (id, "projectId", sha256, method, url, host, path, "pathNoQuery", query,
         "statusCode", "contentType", "requestHeaders", "requestBody",
         "responseHeaders", "responseBody", tool, "sizeBytes", truncated,
         "scopeOk", anomalies, secrets, "createdAt")
       VALUES ${freshValues.join(', ')}
       ON CONFLICT ("projectId", sha256) DO NOTHING
       RETURNING id`,
      ...freshParams,
    );
  }
  const acceptedIds = new Set(insertedRows.map(r => r.id));
  result.duplicates = fresh.length - acceptedIds.size;

  for (let i = 0; i < fresh.length; i++) {
    const p = fresh[i];
    const trafficId = freshIds[i];
    if (!acceptedIds.has(trafficId)) continue;
    result.accepted++;
    newTrafficIds.push(trafficId);
    if (p.contentType.toLowerCase().includes('html')) hasHtml = true;

    // ── AI analysis job (JS assets) ──────────────────────────────────────────
    // The backend auto-queues every captured JS bundle for an AI deep-read
    // (secrets, endpoints, internal URLs, credentials) — processed lazily so
    // AI latency never blocks capture.
    if (p.isJsAsset) {
      try {
        const { enqueueAnalysisJob } = await import('./burp-ai');
        await enqueueAnalysisJob(projectId, trafficId, 'js');
      } catch { /* non-critical */ }
    }

    // ── Endpoint upsert with precomputed merges ──────────────────────────────
    const epKey = `${p.method}\u0000${p.host}\u0000${p.normPath}`;
    let endpointId = seenEndpoints.get(epKey);
    if (!endpointId) {
      const prior = existingEndpoints.get(epKey) ?? { statusCodes: [], anomalies: [], isJsAsset: false };
      const mergedCodes = mergeStatusCodes(prior.statusCodes, p.statusCode);
      const mergedAnoms = mergeAnomalies(prior.anomalies, p.anomalies);
      const ep = await db.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "BurpEndpoint"
          (id, "projectId", method, host, path, "sampleUrl", "hitCount", "statusCodes",
           "firstSeenAt", "lastSeenAt", "isJsAsset", anomalies, "createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$8,$9,$10,$8)
         ON CONFLICT ("projectId", method, host, path) DO UPDATE SET
           "hitCount" = "BurpEndpoint"."hitCount" + 1,
           "lastSeenAt" = EXCLUDED."lastSeenAt",
           "sampleUrl" = CASE WHEN "BurpEndpoint"."sampleUrl" = '' THEN EXCLUDED."sampleUrl" ELSE "BurpEndpoint"."sampleUrl" END,
           "statusCodes" = EXCLUDED."statusCodes",
           "isJsAsset" = "BurpEndpoint"."isJsAsset" OR EXCLUDED."isJsAsset",
           anomalies = EXCLUDED.anomalies
         RETURNING id`,
        uuidv4(), projectId, p.method, p.host, p.normPath, p.url,
        JSON.stringify(mergedCodes), p.createdAt, prior.isJsAsset || p.isJsAsset,
        JSON.stringify(mergedAnoms),
      );
      endpointId = ep[0]?.id;
      if (endpointId) {
        seenEndpoints.set(epKey, endpointId);
        endpointAnomalyCount.set(epKey, mergedAnoms.length);
        result.endpointsUpdated++;
      }
    }

    // ── Tool-tagged auto "tested" marking (Repeater / Intruder only) ─────────
    if (endpointId && (p.tool === 'repeater' || p.tool === 'intruder')) {
      endpointTestMarks.set(epKey, { tool: p.tool, endpointId });
    }

    // Collect candidate text for payload-level auto-testing. Keyed by PATH
    // (host + normalized path) — a payload tried via any method matches
    // checklist items bound to the same path.
    const pathKey = `${p.host}\u0000${p.normPath}`;
    payloadCandidates.set(pathKey, [
      ...(payloadCandidates.get(pathKey) || []),
      { url: p.url, text: `${p.url}\n${p.query}\n${p.reqBody.text}` },
    ]);
    if (!pathEndpoints.has(pathKey)) pathEndpoints.set(pathKey, new Set<string>());
    if (endpointId) pathEndpoints.get(pathKey)!.add(endpointId);
  }

  // ── Apply auto-test marking once per endpoint ──────────────────────────────
  for (const { tool, endpointId } of endpointTestMarks.values()) {
    const marked = await db.$executeRawUnsafe(
      `UPDATE "BurpChecklistItem" SET status = 'tested', "autoMarkedBy" = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "endpointId" = $2 AND status = 'untested'`,
      tool, endpointId,
    );
    if (marked > 0) {
      result.autoMarked += marked;
      await db.$executeRawUnsafe(
        `UPDATE "BurpEndpoint" SET "testedCount" = "testedCount" + $1 WHERE id = $2`,
        marked, endpointId,
      );
    }
  }

  // ── Payload-level auto-testing ─────────────────────────────────────────────
  // When any captured request contains a checklist item's payload string, the
  // item counts as TESTED — replaying a payload through any tool is a real
  // attempt. Matching is per PATH (host + normalized path), so trying a
  // payload with a different HTTP method still validates the technique.
  const pathKeyToEp = new Map<string, string[]>();
  for (const [epKey, ids] of pathEndpoints) {
    pathKeyToEp.set(epKey, [...ids]);
  }
  for (const [epKey, candidates] of payloadCandidates) {
    const endpointIds = pathKeyToEp.get(epKey);
    if (!endpointIds || endpointIds.length === 0) continue;
    const items = await db.$queryRawUnsafe<Array<{ id: string; payload: string; "endpointId": string }>>(
      `SELECT id, payload, "endpointId" FROM "BurpChecklistItem"
       WHERE "endpointId" = ANY($1::text[]) AND status = 'untested' AND LENGTH(payload) >= 6`,
      endpointIds,
    );
    if (items.length === 0) continue;
    // Match against raw AND URL-decoded forms (query-encoded payloads count).
    const raw = candidates.map(c => c.text.toLowerCase()).join('\n');
    let decoded = raw;
    try { decoded += '\n' + decodeURIComponent(raw); } catch { /* keep raw */ }
    const matchIds: string[] = [];
    const matchedEndpointIds = new Set<string>();
    for (const it of items) {
      const needle = (it.payload || '').trim().toLowerCase();
      if (needle.length < 6) continue;
      if (raw.includes(needle) || decoded.includes(needle)) {
        matchIds.push(it.id);
        if (it.endpointId) matchedEndpointIds.add(it.endpointId);
      }
    }
    if (matchIds.length === 0) continue;
    const marked = await db.$executeRawUnsafe(
      `UPDATE "BurpChecklistItem" SET status = 'tested', "autoMarkedBy" = 'payload',
              "resultNote" = 'Payload matched in captured traffic', "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = ANY($1::text[])`,
      matchIds,
    );
    if (marked > 0) {
      result.autoMarked += marked;
      for (const epId of matchedEndpointIds) {
        await db.$executeRawUnsafe(
          `UPDATE "BurpEndpoint" SET "testedCount" = "testedCount" + 1 WHERE id = $1`,
          epId,
        );
      }
    }
  }

  // ── Auto-confirm low-hanging response checks ───────────────────────────────
  // Missing security headers and insecure cookie attributes are CONFIRMED
  // straight from the captured responses (source='auto', status='succeeded') —
  // the tester doesn't have to manually re-verify what the traffic already
  // proves. When a header later appears, the item flips to 'blocked'.
  // (Skipped entirely when this batch carried no HTML responses.)
  if (hasHtml) try {
    const htmlRows = await db.$queryRawUnsafe<Array<{
      host: string; "pathNoQuery": string; method: string; "responseHeaders": string;
    }>>(
      `SELECT host, "pathNoQuery", method, "responseHeaders"
       FROM "BurpTraffic"
       WHERE "projectId" = $1 AND "scopeOk" = true AND "contentType" ILIKE 'text/html%'
       ORDER BY "createdAt" DESC LIMIT 300`,
      projectId,
    );

    const SECURITY_HEADERS = [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
    ];

    // Aggregate per endpoint (host + normalized path).
    const findings = new Map<string, { missing: string[]; insecureCookie: boolean }>();
    for (const r of htmlRows) {
      const key = `${r.host.toLowerCase()}\u0000${normalizePath(r.pathNoQuery)}`;
      const cur = findings.get(key) ?? { missing: [] as string[], insecureCookie: false };
      const headers = safeJson<Record<string, string>>(r.responseHeaders, {});
      const present = new Set(Object.keys(headers).map(h => h.toLowerCase()));
      for (const h of SECURITY_HEADERS) {
        if (!present.has(h) && !cur.missing.includes(h)) cur.missing.push(h);
      }
      const sc = headers['set-cookie'] || '';
      if (sc && !/secure/i.test(sc)) cur.insecureCookie = true;
      findings.set(key, cur);
    }

    if (findings.size > 0) {
      // Resolve endpoint ids for the keys.
      const keys = [...findings.keys()];
      const epParams: unknown[] = [projectId];
      const valuesSql = keys.map((k, i) => {
        const [h, p] = k.split('\u0000');
        epParams.push(h, p);
        return `($${i * 2 + 2}, $${i * 2 + 3})`;
      }).join(', ');
      const epRows2 = await db.$queryRawUnsafe<{ id: string; host: string; path: string }[]>(
        `SELECT id, host, path FROM "BurpEndpoint"
         WHERE "projectId" = $1 AND (host, path) IN (VALUES ${valuesSql})`,
        ...epParams,
      );
      const epByKey = new Map(epRows2.map(e => [`${e.host.toLowerCase()}\u0000${e.path}`, e.id]));
      const epIds = epRows2.map(e => e.id);

      // Existing auto items for those endpoints.
      const existingAuto = epIds.length > 0
        ? await db.$queryRawUnsafe<Array<{ id: string; "endpointId": string; category: string; technique: string; status: string }>>(
            `SELECT id, "endpointId", category, technique, status FROM "BurpChecklistItem"
             WHERE "projectId" = $1 AND source = 'auto' AND "endpointId" = ANY($2::text[])`,
            projectId, epIds,
          )
        : [];

      const upsert = async (endpointId: string, category: string, technique: string, description: string, status: 'succeeded' | 'blocked') => {
        const existing = existingAuto.find(e => e.endpointId === endpointId && e.category === category && e.technique === technique);
        if (existing) {
          if (existing.status !== status) {
            await db.$executeRawUnsafe(
              `UPDATE "BurpChecklistItem" SET status = $1, description = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3`,
              status, description, existing.id,
            );
            if (status === 'succeeded' && existing.status !== 'succeeded') {
              await db.$executeRawUnsafe(`UPDATE "BurpEndpoint" SET "testedCount" = "testedCount" + 1 WHERE id = $1`, endpointId);
            }
          } else if (existing.status === 'succeeded') {
            await db.$executeRawUnsafe(
              `UPDATE "BurpChecklistItem" SET description = $1 WHERE id = $2`, description, existing.id,
            );
          }
          return;
        }
        await db.$executeRawUnsafe(
          `INSERT INTO "BurpChecklistItem"
             (id, "projectId", "endpointId", category, technique, description, payload, status, source, "autoMarkedBy", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'', $7,'auto','evidence',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
          uuidv4(), projectId, endpointId, category, technique, description, status,
        );
        if (status === 'succeeded') {
          result.autoMarked++;
          await db.$executeRawUnsafe(`UPDATE "BurpEndpoint" SET "testedCount" = "testedCount" + 1 WHERE id = $1`, endpointId);
        }
      };

      for (const [key, f] of findings) {
        const endpointId = epByKey.get(key);
        if (!endpointId) continue;
        if (f.missing.length > 0) {
          await upsert(endpointId, 'headers', 'Missing security headers',
            `Confirmed from captured responses — no ${f.missing.map(h => h.replace(/-/g, ' ')).join(' · no ')}.`,
            'succeeded');
        } else {
          await upsert(endpointId, 'headers', 'Missing security headers',
            'All standard security headers present in captured responses.', 'blocked');
        }
        if (f.insecureCookie) {
          await upsert(endpointId, 'headers', 'Insecure cookie attributes',
            'Confirmed from captured responses — a Set-Cookie without the Secure flag was observed.', 'succeeded');
        } else {
          await upsert(endpointId, 'headers', 'Insecure cookie attributes',
            'No insecure Set-Cookie observed in captured responses.', 'blocked');
        }
      }
    }
  } catch (e) {
    console.error('[burp-ingest] auto-confirm response checks failed:', e);
  }

  // ── Retention cleanup (occasional) ─────────────────────────────────────────
  ingestCounter++;
  if (result.accepted > 0 && ingestCounter % 20 === 0) {
    try {
      const days = Math.max(1, Number(project.burpRetentionDays) || 90);
      await db.$executeRawUnsafe(
        `DELETE FROM "BurpTraffic" WHERE "projectId" = $1 AND "createdAt" < CURRENT_TIMESTAMP - ($2 || ' days')::interval`,
        projectId, days,
      );
    } catch { /* non-critical */ }
  }

  // ── Live activity broadcast ────────────────────────────────────────────────
  if (newTrafficIds.length > 0) {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string; method: string; url: string; "statusCode": number; tool: string;
      anomalies: string; "createdAt": Date;
    }>>(
      `SELECT id, method, url, "statusCode", tool, anomalies, "createdAt"
       FROM "BurpTraffic" WHERE id = ANY($1::text[])`,
      newTrafficIds,
    );
    for (const r of rows) {
      broadcast(`burp:${projectId}`, {
        type: 'traffic',
        traffic: {
          id: r.id,
          method: r.method,
          url: r.url,
          statusCode: r.statusCode,
          tool: r.tool,
          anomalies: safeJson<AnomalyFlag[]>(r.anomalies, []),
          createdAt: new Date(r.createdAt).toISOString(),
        },
        ts: Date.now(),
      });
    }
  }

  // ── Lazy AI processing (fire-and-forget — never blocks capture) ────────────
  if (result.accepted > 0) {
    try {
      const { processPendingSecretJobs } = await import('./burp-ai');
      processPendingSecretJobs(projectId, 2).catch(() => {});
    } catch { /* non-critical */ }
  }

  return result;
}
