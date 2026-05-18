/**
 * SLA (Service-Level Agreement) helpers.
 *
 * Each severity gets a remediation deadline expressed in days. The actual
 * day-count differs by engagement type — internal pentests are usually held
 * to a laxer timeline than externally-exposed issues. Both matrices are
 * stored as `AppSetting` rows so admins can tune them without code changes.
 *
 * Setting keys:
 *   slaExternal_critical, slaExternal_high, slaExternal_medium, slaExternal_low, slaExternal_info
 *   slaInternal_critical, slaInternal_high, slaInternal_medium, slaInternal_low, slaInternal_info
 *
 * Defaults align with common industry guidance (e.g. PTaaS contracts):
 *   external:  crit  7d / high 14d / med 30d / low 60d / info  90d
 *   internal:  crit 14d / high 30d / med 60d / low 90d / info 180d
 */
import { db } from './db';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type EngagementType = 'internal' | 'external';

export const SLA_DEFAULTS: Record<EngagementType, Record<Severity, number>> = {
  external: { critical:  7, high: 14, medium: 30, low:  60, info:  90 },
  internal: { critical: 14, high: 30, medium: 60, low:  90, info: 180 },
};

export type SlaMatrix = typeof SLA_DEFAULTS;

let _cache: { matrix: SlaMatrix; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** Load both SLA matrices from AppSetting. Falls back silently to defaults. */
export async function loadSlaMatrix(): Promise<SlaMatrix> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.matrix;

  const matrix: SlaMatrix = JSON.parse(JSON.stringify(SLA_DEFAULTS));
  try {
    const rows = await db.$queryRawUnsafe<{ key: string; value: string }[]>(
      `SELECT key, value FROM "AppSetting" WHERE key LIKE 'sla%'`
    );
    for (const r of rows) {
      const m = r.key.match(/^sla(Internal|External)_(critical|high|medium|low|info)$/);
      if (!m) continue;
      const env = m[1].toLowerCase() as EngagementType;
      const sev = m[2] as Severity;
      const n = parseInt(r.value, 10);
      if (Number.isFinite(n) && n > 0) matrix[env][sev] = n;
    }
  } catch { /* fall back to defaults */ }

  _cache = { matrix, at: Date.now() };
  return matrix;
}

/** Force a reload on next call — invoke from the settings PATCH handler. */
export function invalidateSlaCache() { _cache = null; }

export interface SlaResult {
  /** ISO date YYYY-MM-DD by which the finding must be remediated. */
  deadline: string;
  /** Days remaining (negative if overdue). */
  daysRemaining: number;
  status: 'ok' | 'breaching_soon' | 'overdue' | 'resolved';
  /** Total days allotted for this severity / engagement combo. */
  budgetDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Compute SLA state for a finding given its severity, discovery date and project. */
export function computeSla(
  severity: string,
  discoveredISO: string,
  engagementType: string,
  matrix: SlaMatrix,
  status: string,
): SlaResult {
  const sev = (['critical','high','medium','low','info'].includes(severity)
    ? severity : 'medium') as Severity;
  const env = (engagementType === 'internal' ? 'internal' : 'external') as EngagementType;
  const budgetDays = matrix[env][sev];

  const start = parseISODateOnly(discoveredISO) || new Date();
  const deadlineDate = new Date(start.getTime() + budgetDays * DAY_MS);
  const deadline = isoDateOnly(deadlineDate);
  const today = new Date();
  // Compare day-level only — ignore hours
  const daysRemaining = Math.ceil((deadlineDate.getTime() - startOfDay(today).getTime()) / DAY_MS);

  let slaStatus: SlaResult['status'];
  if (status === 'resolved' || status === 'accepted') {
    slaStatus = 'resolved';
  } else if (daysRemaining < 0) {
    slaStatus = 'overdue';
  } else if (daysRemaining <= Math.max(1, Math.floor(budgetDays * 0.2))) {
    slaStatus = 'breaching_soon';
  } else {
    slaStatus = 'ok';
  }

  return { deadline, daysRemaining, status: slaStatus, budgetDays };
}

function parseISODateOnly(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
