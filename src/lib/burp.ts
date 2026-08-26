/**
 * Burp Bridge core — endpoint normalization, anomaly rules, secret scanning,
 * scope guard, dedup, and traffic↔text matching. Shared by the ingest route,
 * the traffic/endpoint/checklist APIs, and the AI enrichment flows.
 */
import { createHash } from 'crypto';
import { db } from './db';

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_BATCH = 200;          // events per ingest POST
export const MAX_BODY_BYTES = 100_000; // per request/response body (truncate beyond)
export const MAX_HEADERS = 60;         // headers per side
export const MAX_AI_BODY_CHARS = 6000; // bodies sent to AI (per side)
export const MAX_AI_TOTAL_CHARS = 40000; // cap total traffic context for AI

export interface BurpTrafficEvent {
  method?: string;
  url?: string;
  host?: string;
  path?: string;
  query?: string;
  statusCode?: number;
  contentType?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  /** proxy | repeater | intruder | scanner | manual */
  tool?: string;
  timestamp?: string;
}

export interface AnomalyFlag {
  type: string;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'info';
}

export interface SecretHit {
  type: string;
  value: string;   // masked
  context: string; // surrounding snippet
  /** 'ai' when found by the AI deep-read (regex scanner has no field). */
  source?: 'regex' | 'ai';
  confidence?: 'high' | 'medium' | 'low';
}

// ── URL / endpoint normalization ──────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID_RE = /^[a-z0-9]{20,32}$/i;
const HEX_TOKEN_RE = /^[0-9a-f]{8,}$/i;
const LONG_TOKEN_RE = /^[A-Za-z0-9_-]{16,}$/;
const NUM_RE = /^\d+$/;

/** Collapse a single path segment into its generic form. */
export function normalizeSegment(seg: string): string {
  if (!seg) return seg;
  if (UUID_RE.test(seg)) return ':id';
  if (NUM_RE.test(seg)) return ':id';
  if (HEX_TOKEN_RE.test(seg)) return ':hex';
  if (CUID_RE.test(seg)) return ':id';
  if (LONG_TOKEN_RE.test(seg)) return ':token';
  if (seg.length >= 6 && /^[0-9a-f]{6,}$/i.test(seg)) return ':hex';
  return seg;
}

/** Normalize a path (query stripped) into its endpoint form, e.g.
 *  `/api/users/123/edit?x=1` → `/api/users/:id/edit`. */
export function normalizePath(pathNoQuery: string): string {
  const p = pathNoQuery.startsWith('/') ? pathNoQuery : `/${pathNoQuery}`;
  const segs = p.split('/').map(s => {
    // strip file extensions that carry tokens (e.g. report_9c2d.pdf)
    const ext = s.match(/^(.*)\.([A-Za-z0-9]{1,8})$/);
    if (ext) {
      const base = normalizeSegment(ext[1]);
      return `${base}.${ext[2]}`;
    }
    return normalizeSegment(s);
  });
  let out = segs.join('/').replace(/\/+/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

export function parseUrl(rawUrl: string): { host: string; pathNoQuery: string; query: string; path: string } {
  try {
    const u = new URL(rawUrl);
    return {
      host: (u.hostname || '').toLowerCase(),
      pathNoQuery: u.pathname || '/',
      query: u.search ? u.search.slice(1) : '',
      path: `${u.pathname || '/'}${u.search || ''}`,
    };
  } catch {
    // Not a full URL — treat as host+path
    const m = rawUrl.match(/^(?:https?:\/\/)?([^/?#]+)([^?#]*)(?:\?([^#]*))?/);
    if (!m) return { host: '', pathNoQuery: rawUrl, query: '', path: rawUrl };
    return {
      host: m[1].toLowerCase(),
      pathNoQuery: m[2] || '/',
      query: m[3] || '',
      path: `${m[2] || '/'}${m[3] ? `?${m[3]}` : ''}`,
    };
  }
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// ── Scope guard ───────────────────────────────────────────────────────────────

function hostMatchesScope(host: string, scopeLine: string): boolean {
  const line = scopeLine.trim().toLowerCase().replace(/^https?:\/\//, '');
  if (!line) return false;
  let h = host.toLowerCase();
  // strip port from the host for matching
  h = h.split(':')[0];
  const target = line.split(':')[0];
  if (target.startsWith('*.')) {
    const base = target.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  if (target.startsWith('*')) {
    return h.endsWith(target.slice(1));
  }
  return h === target;
}

/** Returns true when host is allowed by the project's declared scope lines. */
export function isHostInScope(host: string, scopeText: string): boolean {
  const lines = (scopeText || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return true; // no scope declared → allow (extension-side guard)
  return lines.some(l => hostMatchesScope(host, l));
}

// ── Anomaly rules ─────────────────────────────────────────────────────────────

const ANOMALY_RULES: Array<{ type: string; label: string; severity: AnomalyFlag['severity']; test: (e: { statusCode: number; contentType: string; pathNoQuery: string; query: string; requestBody: string; responseHeaders: Record<string, string>; responseBody: string; requestHeaders: Record<string, string> }) => boolean }> = [
  {
    type: 'status_5xx', label: 'Server error (5xx)', severity: 'medium',
    test: e => e.statusCode >= 500,
  },
  {
    type: 'auth_denied', label: 'Auth/authorization response (401/403)', severity: 'info',
    test: e => e.statusCode === 401 || e.statusCode === 403,
  },
  {
    type: 'sql_error', label: 'SQL error pattern in response', severity: 'high',
    test: e => /(SQLSTATE|syntax error at or near|You have an error in your SQL|ORA-\d{5}|mysql_|PostgreSQL|SQLite3|Microsoft OLE DB|Incorrect syntax near)/i.test(e.responseBody.slice(0, 8000)),
  },
  {
    type: 'stack_trace', label: 'Stack trace / debug output in response', severity: 'high',
    test: e => /(at [\w.$]+\(|^\s*at\s+[\w.$]+\.[\w$]+\(|Traceback \(most recent call last\)|\.cs:line \d+|\.java:\d+|at com\.|at org\.|at java\.|in [\w./]+\.php on line \d+)/mi.test(e.responseBody.slice(0, 8000)),
  },
  {
    type: 'debug_mode', label: 'Debug / verbose error markers', severity: 'medium',
    test: e => /(debug\s*=\s*true|x-debug|DEBUG MODE|display_errors|enable_debug|exception|Unhandled|Fatal error|Undefined variable|Warning:)/i.test(e.responseBody.slice(0, 4000)) && e.statusCode >= 400,
  },
  {
    type: 'sensitive_param', label: 'Secret-ish parameter in query string', severity: 'medium',
    test: e => /(^|[?&])(token|api[_-]?key|secret|password|passwd|pwd|access[_-]?token|auth|credential|signature|sig|private[_-]?key|aws[_-]?secret|client[_-]?secret)=/i.test(e.query) || /(^|[?&])(token|api[_-]?key|secret|password|passwd|pwd|access[_-]?token|auth|credential|signature|sig|private[_-]?key|client[_-]?secret)=/i.test(e.requestBody.slice(0, 2000)),
  },
  {
    type: 'admin_path', label: 'Admin/internal path accessed', severity: 'medium',
    test: e => /(\/admin|\/internal|\/management|\/console|\/debug|\/actuator|\/server-status|\/phpmyadmin|\/swagger|\/api-docs|\/graphql|\/.git)/i.test(e.pathNoQuery),
  },
  {
    type: 'large_response', label: 'Unusually large response body', severity: 'info',
    test: e => e.responseBody.length > 1_000_000,
  },
  {
    type: 'cors_wildcard', label: 'CORS allows any origin with credentials', severity: 'medium',
    test: e => e.responseHeaders['access-control-allow-origin'] === '*' && /true/i.test(e.responseHeaders['access-control-allow-credentials'] || ''),
  },
  {
    type: 'insecure_cookie', label: 'Cookie without Secure/HttpOnly', severity: 'low',
    test: e => {
      const sc = e.responseHeaders['set-cookie'] || '';
      if (!sc) return false;
      return /;/i.test(sc) && !/secure/i.test(sc);
    },
  },
  {
    type: 'jwt_response', label: 'JWT appears in response body', severity: 'medium',
    test: e => /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(e.responseBody.slice(0, 8000)),
  },
  {
    type: 'internal_ref', label: 'Internal host reference in response', severity: 'medium',
    test: e => /(https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1|\.local|internal|intranet|corp))/i.test(e.responseBody.slice(0, 8000)),
  },
  {
    type: 'php_info', label: 'phpinfo / sensitive config page', severity: 'high',
    test: e => /phpinfo\(\)|PHP Version \d|Configuration File \(php\.ini\)/.test(e.responseBody.slice(0, 4000)),
  },
  {
    type: 'spring_actuator', label: 'Spring Boot actuator endpoint', severity: 'high',
    test: e => /\/actuator(\/|\?|$)/i.test(e.pathNoQuery) && e.statusCode < 400,
  },
  {
    type: 'api_docs', label: 'API docs / schema exposure', severity: 'low',
    test: e => /(\/swagger(\/|$)|(\/|\.)openapi\.json|(\/|\.)api-docs|(\/|\.)graphql|(\/|\.)redoc)/i.test(e.pathNoQuery) && e.statusCode < 400,
  },
  {
    type: 'directory_listing', label: 'Directory listing', severity: 'medium',
    test: e => e.statusCode === 200 && /(<title>.*Index of|Parent Directory|Directory listing for)/i.test(e.responseBody.slice(0, 4000)),
  },
  {
    type: 'command_error', label: 'Command execution error hints', severity: 'high',
    test: e => /(sh: |bash: |command not found|No such file or directory|Permission denied|\/bin\/sh:|\/bin\/bash:)/i.test(e.responseBody.slice(0, 4000)),
  },
];

/** Run the anomaly rules over one parsed event. */
export function detectAnomalies(e: {
  statusCode: number; contentType: string; pathNoQuery: string; query: string;
  requestBody: string; responseHeaders: Record<string, string>; responseBody: string;
  requestHeaders: Record<string, string>;
}): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  for (const rule of ANOMALY_RULES) {
    try { if (rule.test(e)) flags.push({ type: rule.type, label: rule.label, severity: rule.severity }); }
    catch { /* rule bug — skip */ }
  }
  return flags;
}

// ── Secret scanning ───────────────────────────────────────────────────────────

interface SecretRule { type: string; re: RegExp; mask: (m: string) => string }

function maskSecret(value: string): string {
  if (value.length <= 8) return value.slice(0, 2) + '***';
  return value.slice(0, 4) + '…' + value.slice(-2) + ` (${value.length} chars)`;
}

const SECRET_RULES: SecretRule[] = [
  { type: 'aws_access_key', re: /\b((?:AKIA|ASIA)[A-Z0-9]{16})\b/g, mask: maskSecret },
  { type: 'google_api_key', re: /\b(AIza[0-9A-Za-z_-]{35})\b/g, mask: maskSecret },
  { type: 'github_token', re: /\b(gh[pousr]_[0-9A-Za-z]{36,255})\b/g, mask: maskSecret },
  { type: 'slack_token', re: /\b(xox[baprs]-[0-9A-Za-z-]{10,255})\b/g, mask: maskSecret },
  { type: 'stripe_key', re: /\b(sk_live_[0-9A-Za-z]{24,})\b/g, mask: maskSecret },
  { type: 'jwt', re: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, mask: maskSecret },
  { type: 'private_key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]{0,400}?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, mask: m => m.slice(0, 32) + '…' },
  { type: 'firebase_key', re: /\b(AIza[0-9A-Za-z_-]{35})\b|firebaseio\.com|firebase\.googleapis/g, mask: maskSecret },
  { type: 's3_bucket', re: /(?:https?:\/\/)?([a-z0-9.-]+\.s3(?:-[a-z0-9-]+)?\.amazonaws\.com)/gi, mask: m => m },
  { type: 'internal_url', re: /(https?:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1|[\w.-]+\.internal|[\w.-]+\.local)(?::\d+)?[^\s"'<>)]*)/gi, mask: m => m },
  { type: 'generic_api_key', re: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\s*[=:]\s*["']?([A-Za-z0-9_\-./+]{12,})/gi, mask: m => m.split(/[=:]/).slice(0, 1).join() + '=' + maskSecret(m.split(/[=:]/).pop()!.trim().replace(/["']/g, '')) },
];

/** Scan a body for high-signal secrets. Returns masked hits. */
export function scanSecrets(body: string, limit = 40): SecretHit[] {
  if (!body) return [];
  const sample = body.slice(0, 200_000); // scan first 200KB
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  for (const rule of SECRET_RULES) {
    let m: RegExpExecArray | null;
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    while ((m = re.exec(sample)) !== null && hits.length < limit) {
      const full = m[0];
      const key = `${rule.type}:${full.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(0, m.index - 60);
      hits.push({
        type: rule.type,
        value: rule.mask(full),
        context: sample.slice(start, Math.min(sample.length, m.index + full.length + 60)).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return hits;
}

// ── Traffic↔text matching ─────────────────────────────────────────────────────

interface MatchableEndpoint {
  id: string;
  method: string;
  host: string;
  path: string;       // normalized
  sampleUrl: string;
  hitCount: number;
  anomalies: AnomalyFlag[];
  isJsAsset: boolean;
}

function tokenize(text: string): Set<string> {
  const words = new Set<string>();
  const lower = text.toLowerCase();
  // URL-ish fragments
  for (const m of lower.matchAll(/[a-z0-9][a-z0-9_\-./:?&=]{2,}/g)) {
    const frag = m[0];
    for (const part of frag.split(/[\/?&=.#-]/)) {
      if (part.length >= 3 && part.length <= 40 && !/^\d+$/.test(part)) words.add(part);
    }
  }
  for (const w of lower.match(/[a-z0-9]{3,}/g) || []) words.add(w);
  return words;
}

function scoreEndpoint(ep: MatchableEndpoint, words: Set<string>, text: string): { score: number; matched: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  const matched: string[] = [];
  const candidates = [ep.path, ep.sampleUrl, `${ep.method} ${ep.path}`, ep.host];
  for (const cand of candidates) {
    const c = cand.toLowerCase();
    if (c.length > 3 && lower.includes(c)) {
      // direct substring hit — strong signal
      score += 60 + Math.min(40, c.length);
      matched.push(c);
    }
  }
  for (const seg of ep.path.split('/')) {
    if (seg === ':id' || seg === ':hex' || seg === ':token' || seg.length < 3) continue;
    if (words.has(seg)) {
      score += seg.length >= 8 ? 14 : 8;
      matched.push(seg);
    }
  }
  for (const part of ep.host.split('.')) {
    if (part.length >= 4 && words.has(part)) { score += 6; matched.push(part); }
  }
  return { score, matched };
}

export interface TrafficSample {
  id: string;
  method: string;
  url: string;
  statusCode: number;
  contentType: string;
  tool: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  anomalies: AnomalyFlag[];
  secrets: SecretHit[];
  createdAt: string;
}

export interface TrafficMatch {
  endpoint: MatchableEndpoint;
  score: number;
  matched: string[];
  samples: TrafficSample[];
}

/**
 * Find endpoints whose normalized paths / tokens overlap with the given text
 * (notes, finding title, prompt…) and return up to `limit` matches, each with
 * a few recent traffic samples. Used by the "matching requests" picker.
 */
export async function findMatchingTraffic(
  projectId: string,
  text: string,
  opts: { limit?: number; samplesPerMatch?: number } = {},
): Promise<TrafficMatch[]> {
  const limit = opts.limit ?? 8;
  const samplesPer = opts.samplesPerMatch ?? 3;
  if (!text || !text.trim()) return [];

  const rows = await db.$queryRawUnsafe<Array<{
    id: string; method: string; host: string; path: string; "sampleUrl": string;
    "hitCount": number; anomalies: string; "isJsAsset": boolean;
  }>>(
    `SELECT id, method, host, path, "sampleUrl", "hitCount", anomalies, "isJsAsset"
     FROM "BurpEndpoint" WHERE "projectId" = $1 AND "hitCount" > 0
     ORDER BY "lastSeenAt" DESC LIMIT 3000`,
    projectId,
  );

  const endpoints: MatchableEndpoint[] = rows.map(r => ({
    id: r.id,
    method: r.method,
    host: r.host,
    path: r.path,
    sampleUrl: r.sampleUrl,
    hitCount: Number(r.hitCount),
    isJsAsset: r.isJsAsset,
    anomalies: safeJson(r.anomalies, []),
  }));

  const words = tokenize(text);
  const scored = endpoints
    .map(ep => ({ ep, ...scoreEndpoint(ep, words, text) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const out: TrafficMatch[] = [];
  for (const { ep, score, matched } of scored) {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string; method: string; url: string; "pathNoQuery": string; "statusCode": number; "contentType": string;
      tool: string; "requestHeaders": string; "requestBody": string; "responseHeaders": string;
      "responseBody": string; anomalies: string; secrets: string; "createdAt": Date;
    }>>(
      `SELECT id, method, url, "pathNoQuery", "statusCode", "contentType", tool, "requestHeaders", "requestBody",
              "responseHeaders", "responseBody", anomalies, secrets, "createdAt"
       FROM "BurpTraffic"
       WHERE "projectId" = $1 AND host = $2 AND method = $3
       ORDER BY "createdAt" DESC LIMIT 30`,
      projectId, ep.host, ep.method,
    );
    // Keep samples whose normalized path matches the endpoint (raw stored
    // paths vary per request — ids, hashes, etc.).
    const rawSamples = rows.filter(r => normalizePath(r.pathNoQuery) === ep.path).slice(0, samplesPer);
    const samples = (rawSamples.length > 0 ? rawSamples : rows.slice(0, 1)).map(s => ({
      id: s.id,
      method: s.method,
      url: s.url,
      statusCode: s.statusCode,
      contentType: s.contentType,
      tool: s.tool,
      requestHeaders: safeJson(s.requestHeaders, {}),
      requestBody: s.requestBody || '',
      responseHeaders: safeJson(s.responseHeaders, {}),
      responseBody: s.responseBody || '',
      anomalies: safeJson(s.anomalies, []),
      secrets: safeJson(s.secrets, []),
      createdAt: new Date(s.createdAt).toISOString(),
    }));

    out.push({ endpoint: ep, score, matched, samples });
  }
  return out;
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/**
 * Normalize raw header input into a lowercased-name map. Accepts the three
 * shapes producers may send:
 *   - `{"Name":"Value", ...}`            (object map)
 *   - `["Name: Value", ...]`             (raw header lines)
 *   - `[{"name":"Name","value":"Value"}]` (structured list)
 */
export function headersToRecord(h: Record<string, string> | Array<string | Record<string, string>> | null | undefined): Record<string, string> {
  if (!h) return {};
  const out: Record<string, string> = {};
  if (Array.isArray(h)) {
    for (const item of h) {
      if (typeof item === 'string') {
        const idx = item.indexOf(':');
        if (idx <= 0) continue;
        out[item.slice(0, idx).trim().toLowerCase()] = item.slice(idx + 1).trim();
      } else if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const name = String(rec.name ?? rec.Name ?? rec.key ?? '').trim();
        const value = rec.value !== undefined ? String(rec.value) : String(rec.Value ?? rec.val ?? '');
        if (name) out[name.toLowerCase()] = value;
      }
    }
    return out;
  }
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  return out;
}

export function recordToHeadersString(r: Record<string, string>): string {
  return JSON.stringify(r);
}

/** Truncate a body for AI context with a marker. */
export function truncateForAI(body: string, max = MAX_AI_BODY_CHARS): string {
  if (!body) return '';
  if (body.length <= max) return body;
  return `${body.slice(0, max)}\n…[truncated ${body.length - max} chars]`;
}

/** Minimal shape buildTrafficPromptBlock needs — satisfied by both
 *  TrafficSample (from the DB) and BurpTrafficPayload (AI context). */
export interface TrafficLike {
  method: string;
  url: string;
  statusCode: number;
  tool?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

/** Build a compact human-readable traffic block for AI prompts. */
export function buildTrafficPromptBlock(samples: TrafficLike[], maxTotal = MAX_AI_TOTAL_CHARS): string {
  if (!samples.length) return '';
  let budget = maxTotal;
  const parts: string[] = [];
  for (const s of samples.slice(0, 10)) {
    const reqHead = Object.entries(s.requestHeaders || {}).slice(0, 12).map(([k, v]) => `${k}: ${v}`).join('\n');
    const resHead = Object.entries(s.responseHeaders || {}).slice(0, 12).map(([k, v]) => `${k}: ${v}`).join('\n');
    const reqBody = truncateForAI(s.requestBody || '', 4000);
    const resBody = truncateForAI(s.responseBody || '', 6000);
    const block = [
      `── [${s.tool || 'proxy'}] ${s.method} ${s.url} → ${s.statusCode}`,
      reqHead ? `REQUEST HEADERS:\n${reqHead}` : '',
      reqBody ? `REQUEST BODY:\n${reqBody}` : '',
      resHead ? `RESPONSE HEADERS:\n${resHead}` : '',
      resBody ? `RESPONSE BODY:\n${resBody}` : '',
    ].filter(Boolean).join('\n');
    if (block.length > budget) break;
    budget -= block.length;
    parts.push(block);
  }
  return parts.join('\n\n');
}

export function stripAuthHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const lk = k.toLowerCase();
    if (['authorization', 'cookie', 'x-api-key', 'proxy-authorization', 'set-cookie'].includes(lk)) {
      out[k] = v.length > 12 ? `${v.slice(0, 8)}…[redacted]` : '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Load traffic rows by ids, stripped/truncated for AI consumption. */
export async function loadTrafficForAI(projectId: string, ids: string[]): Promise<TrafficSample[]> {
  if (!ids.length) return [];
  const rows = await db.$queryRawUnsafe<Array<{
    id: string; method: string; url: string; "statusCode": number; "contentType": string;
    tool: string; "requestHeaders": string; "requestBody": string; "responseHeaders": string;
    "responseBody": string; anomalies: string; secrets: string; "createdAt": Date;
  }>>(
    `SELECT id, method, url, "statusCode", "contentType", tool, "requestHeaders", "requestBody",
            "responseHeaders", "responseBody", anomalies, secrets, "createdAt"
     FROM "BurpTraffic" WHERE "projectId" = $1 AND id = ANY($2::text[])`,
    projectId, ids,
  );
  return rows.map(s => ({
    id: s.id,
    method: s.method,
    url: s.url,
    statusCode: s.statusCode,
    contentType: s.contentType,
    tool: s.tool,
    requestHeaders: stripAuthHeaders(safeJson(s.requestHeaders, {})),
    requestBody: s.requestBody || '',
    responseHeaders: stripAuthHeaders(safeJson(s.responseHeaders, {})),
    responseBody: s.responseBody || '',
    anomalies: safeJson(s.anomalies, []),
    secrets: safeJson(s.secrets, []),
    createdAt: new Date(s.createdAt).toISOString(),
  }));
}
