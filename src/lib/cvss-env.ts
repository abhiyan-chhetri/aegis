/**
 * CVSS environmental adjustment.
 *
 * Standard CVSS 3.1 base scores describe a worst-case impact for the
 * vulnerability. The "Environmental" group of metrics lets you adjust those
 * impacts based on YOUR specific asset:
 *
 *   - Confidentiality Requirement → driven by how sensitive the data is
 *     (the customer's data classification: C1 Public … C4 Restricted)
 *   - Integrity / Availability Requirement → driven by how critical the
 *     asset is overall (Bronze … Diamond)
 *
 * The rule the team agreed on:
 *
 *   If a finding has CONFIDENTIALITY impact = High but the asset only
 *   handles C1 (public) data, the actual confidentiality impact is LOW
 *   because the data is already public.
 *
 *   If a finding has INTEGRITY/AVAILABILITY impact = High on a Bronze
 *   asset, the practical impact is lower than on a Diamond asset.
 *
 * We translate the base C/I/A letters (N/L/H) into an "adjusted" letter
 * using the data class for C and the criticality for I/A. Severity and
 * the displayed CVSS score are then recomputed from the adjusted letters.
 */

export type CvssLetter = 'N' | 'L' | 'H';
export type DataClass = 'C1' | 'C2' | 'C3' | 'C4';
export type Criticality = 'diamond' | 'silver' | 'bronze' | 'other';

export interface CvssVector {
  AV: string; AC: string; PR: string; UI: string; S: string;
  C: CvssLetter; I: CvssLetter; A: CvssLetter;
}

// Confidentiality multiplier matrix — H/L/N base × C1..C4 data class
// Output is the ADJUSTED Confidentiality letter the report should use.
const C_ADJUST: Record<CvssLetter, Record<DataClass, CvssLetter>> = {
  // Base = "High" confidentiality impact
  H: { C1: 'L', C2: 'L', C3: 'H', C4: 'H' },
  // Base = "Low" confidentiality impact
  L: { C1: 'N', C2: 'L', C3: 'L', C4: 'H' },
  // Base = "None" — no adjustment possible
  N: { C1: 'N', C2: 'N', C3: 'N', C4: 'N' },
};

// Integrity / Availability multiplier matrix — H/L/N × Diamond..Other
// Diamond assets escalate, Bronze/Other de-escalate.
const IA_ADJUST: Record<CvssLetter, Record<Criticality, CvssLetter>> = {
  H: { diamond: 'H', silver: 'H', bronze: 'L', other: 'L' },
  L: { diamond: 'H', silver: 'L', bronze: 'L', other: 'N' },
  N: { diamond: 'N', silver: 'N', bronze: 'N', other: 'N' },
};

export interface AdjustedCvss {
  base: CvssVector;
  adjusted: CvssVector;
  score: number;          // recomputed numeric CVSS from adjusted vector
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Did any C/I/A letter actually change vs base? */
  isAdjusted: boolean;
}

/**
 * Adjust a CVSS base vector for the asset's environmental context and
 * recompute the numeric score + severity. Pure function — no side effects.
 */
export function adjustCvss(
  base: CvssVector,
  dataClass: DataClass = 'C3',
  criticality: Criticality = 'silver',
): AdjustedCvss {
  const adjC = C_ADJUST[base.C]?.[dataClass] ?? base.C;
  const adjI = IA_ADJUST[base.I]?.[criticality] ?? base.I;
  const adjA = IA_ADJUST[base.A]?.[criticality] ?? base.A;
  const adjusted: CvssVector = { ...base, C: adjC, I: adjI, A: adjA };
  const score = computeCvssScore(adjusted);
  return {
    base,
    adjusted,
    score,
    severity: severityForScore(score),
    isAdjusted: adjC !== base.C || adjI !== base.I || adjA !== base.A,
  };
}

// ── Numeric CVSS 3.1 base-score computation ────────────────────────────────
// Sub-score weights from the official CVSS 3.1 specification.
const AV_WEIGHTS:  Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.20 };
const AC_WEIGHTS:  Record<string, number> = { L: 0.77, H: 0.44 };
const UI_WEIGHTS:  Record<string, number> = { N: 0.85, R: 0.62 };
const PR_U:        Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_C:        Record<string, number> = { N: 0.85, L: 0.68, H: 0.50 };
const CIA_WEIGHTS: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

export function computeCvssScore(v: CvssVector): number {
  const C = CIA_WEIGHTS[v.C] ?? 0;
  const I = CIA_WEIGHTS[v.I] ?? 0;
  const A = CIA_WEIGHTS[v.A] ?? 0;
  const iss = 1 - (1 - C) * (1 - I) * (1 - A);
  if (iss === 0) return 0;
  const scoped = v.S === 'C';
  const impact = scoped
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;
  const prTable = scoped ? PR_C : PR_U;
  const exploit = 8.22
    * (AV_WEIGHTS[v.AV] ?? 0)
    * (AC_WEIGHTS[v.AC] ?? 0)
    * (prTable[v.PR] ?? 0)
    * (UI_WEIGHTS[v.UI] ?? 0);
  let score: number;
  if (impact <= 0) {
    score = 0;
  } else if (scoped) {
    score = Math.min(1.08 * (impact + exploit), 10);
  } else {
    score = Math.min(impact + exploit, 10);
  }
  // Round up to one decimal place (per CVSS spec)
  return Math.ceil(score * 10) / 10;
}

export function severityForScore(score: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >  0.0) return 'low';
  return 'info';
}

// ── Human-readable labels for UI ────────────────────────────────────────────
export const DATA_CLASS_LABEL: Record<DataClass, string> = {
  C1: 'C1 · Public',
  C2: 'C2 · Internal',
  C3: 'C3 · Confidential',
  C4: 'C4 · Restricted',
};
export const DATA_CLASS_HINT: Record<DataClass, string> = {
  C1: 'Information already public. Confidentiality impact is generally low.',
  C2: 'Internal use only. Limited business impact if exposed.',
  C3: 'Confidential — customer / contractual data.',
  C4: 'Strictly restricted — regulated data (PCI, PHI, secrets).',
};
export const CRITICALITY_LABEL: Record<Criticality, string> = {
  diamond: 'Diamond · Tier-0 critical',
  silver:  'Silver · Business-critical',
  bronze:  'Bronze · Standard',
  other:   'Other · Low impact',
};
export const CRITICALITY_HINT: Record<Criticality, string> = {
  diamond: 'Mission-critical system. Any outage / integrity loss is severe.',
  silver:  'Important system. Outage hurts but is recoverable.',
  bronze:  'Standard internal system. Limited business impact.',
  other:   'Sandbox / test / experimental. Minimal impact.',
};
