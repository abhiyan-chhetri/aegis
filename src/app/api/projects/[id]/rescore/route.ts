/**
 * POST /api/projects/[id]/rescore
 *
 * Re-applies the environmental CVSS adjustment matrix to every finding in
 * the project. Triggered automatically by the project edit form whenever
 * the Data Classification or Asset Criticality fields change.
 *
 * Per-finding logic:
 *   1. Parse the stored cvssVector string ("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N")
 *   2. Apply the adjuster with the project's current dataClassification +
 *      criticality (so confidentiality letter rolls down on C1 / up on C4,
 *      integrity / availability roll based on criticality)
 *   3. Recompute the numeric CVSS 3.1 score and severity letter
 *   4. Write back the new vector + score + severity
 *
 * The audit log records the rescore as a single Project-level event so
 * compliance can see exactly when re-scoring happened and what fields
 * changed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureEnvColumns } from '@/lib/ensure-env-columns';
import { adjustCvss, type CvssVector, type DataClass, type Criticality, type CvssLetter } from '@/lib/cvss-env';
import { v4 as uuidv4 } from 'uuid';

function parseVector(v: string | null | undefined): CvssVector | null {
  if (!v) return null;
  const parts = Object.fromEntries(
    v.split('/').map(p => {
      const [k, val] = p.split(':');
      return [k, val];
    }),
  );
  const requiredKeys = ['AV','AC','PR','UI','S','C','I','A'] as const;
  if (!requiredKeys.every(k => typeof parts[k] === 'string')) return null;
  return {
    AV: parts.AV, AC: parts.AC, PR: parts.PR, UI: parts.UI, S: parts.S,
    C: parts.C as CvssLetter, I: parts.I as CvssLetter, A: parts.A as CvssLetter,
  };
}

function serializeVector(v: CvssVector): string {
  return `AV:${v.AV}/AC:${v.AC}/PR:${v.PR}/UI:${v.UI}/S:${v.S}/C:${v.C}/I:${v.I}/A:${v.A}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;

  // Self-heal env columns on first call after a code update
  await ensureEnvColumns().catch(() => { /* fall through */ });

  // ── 1. Load the project's environmental settings ──────────────────────────
  const projectRows = await db.$queryRawUnsafe<{ dataClassification: string; criticality: string }[]>(
    `SELECT COALESCE("dataClassification", 'C3') AS "dataClassification",
            COALESCE("criticality", 'silver') AS "criticality"
     FROM "Project" WHERE id = $1`,
    projectId,
  );
  if (projectRows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const dataClass = projectRows[0].dataClassification as DataClass;
  const criticality = projectRows[0].criticality as Criticality;

  // ── 2. Load every finding's CVSS vector ──────────────────────────────────
  const findings = await db.finding.findMany({
    where: { projectId },
    select: { id: true, code: true, severity: true, cvss: true, cvssVector: true },
  });

  let rescored = 0;
  const skipped = { noVector: 0, noChange: 0 };
  const changes: { findingId: string; code: string; from: number; to: number; severity: string }[] = [];

  // ── 3. Recompute one at a time. Tiny project → no batching needed. ───────
  for (const f of findings) {
    const vec = parseVector(f.cvssVector);
    if (!vec) {
      // Empty / malformed cvssVector — usually a finding the tester hasn't
      // scored yet. Nothing to adjust; skip cleanly and report it back.
      skipped.noVector++;
      continue;
    }
    const adj = adjustCvss(vec, dataClass, criticality);

    // What "no change" means:
    //   1. The adjusted vector is byte-for-byte the same as the stored one
    //      (none of the C/I/A letters moved), AND
    //   2. The recomputed numeric score matches the score already stored.
    // If EITHER differs we update — that catches the case where a previous
    // bug left a finding with a stale cvss=0 but a valid vector that
    // actually computes to a non-zero score.
    const sameVector = serializeVector(adj.adjusted) === f.cvssVector;
    const sameScore  = Math.abs(adj.score - f.cvss) < 0.05; // 1-decimal CVSS comparison
    if (sameVector && sameScore) {
      skipped.noChange++;
      continue;
    }

    await db.finding.update({
      where: { id: f.id },
      data: {
        cvssVector: serializeVector(adj.adjusted),
        cvss: adj.score,
        severity: adj.severity,
      },
    });
    changes.push({ findingId: f.id, code: f.code, from: f.cvss, to: adj.score, severity: adj.severity });
    rescored++;
  }

  // ── 4. Single audit-log event summarising the rescore ─────────────────────
  if (rescored > 0) {
    await db.$executeRawUnsafe(
      `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", changes, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      uuidv4(), session.id, 'rescore_environmental', 'Project', projectId,
      JSON.stringify({ dataClassification: dataClass, criticality, rescored, changes, skipped }),
      new Date().toISOString(),
    );
  }

  return NextResponse.json({
    ok: true,
    total: findings.length,
    rescored,
    skipped,
    dataClassification: dataClass,
    criticality,
    changes,
  });
}
