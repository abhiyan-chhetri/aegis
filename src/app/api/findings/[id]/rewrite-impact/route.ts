/**
 * POST /api/findings/[id]/rewrite-impact
 *
 * Scope-aware AI rewrite: regenerates ONLY the Impact paragraph of a single
 * finding, using the project's current data classification + criticality so
 * the prose lines up with the (possibly just-changed) environmental CVSS.
 *
 * Triggered from the edit-project rescore confirmation toast: "Re-scored 3
 * findings — Rewrite impact text with AI?" → yes calls this once per finding.
 *
 * Skips findings flagged cvssLocked (the team decided NOT to env-adjust this
 * one — rewriting the prose would contradict that intent).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateFinding } from '@/lib/ai';

// Reuse the same AI config resolver as /api/ai/generate
import type { AIConfig } from '@/lib/ai';
async function getAIConfig(): Promise<AIConfig> {
  const rows = await db.$queryRawUnsafe<{ key: string; value: string }[]>(
    `SELECT key, value FROM "AppSetting" WHERE key IN ('aiProvider','aiApiKey','aiBaseUrl','aiModel','aiRegion','aiAccessKeyId','aiSecretAccessKey','aiBedrockApiKey','aiBedrockAuthMode')`,
  );
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return {
    provider: (s.aiProvider as AIConfig['provider']) || 'demo',
    apiKey: s.aiApiKey || '',
    baseUrl: s.aiBaseUrl || '',
    model: s.aiModel || '',
    region: s.aiRegion || '',
    accessKeyId: s.aiAccessKeyId || '',
    secretAccessKey: s.aiSecretAccessKey || '',
    bedrockApiKey: s.aiBedrockAuthMode === 'apikey' ? (s.aiBedrockApiKey || '') : '',
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Load the finding + its project's env via raw SQL (so it works regardless
  // of whether prisma generate has been re-run)
  const rows = await db.$queryRawUnsafe<Array<{
    id: string; title: string; description: string; cwe: string;
    projectId: string; projectName: string;
    dataClassification: string; criticality: string;
    cvssLocked: boolean;
    assets: string;
  }>>(`
    SELECT f.id, f.title, f.description, f.cwe,
           f."projectId",
           p.name AS "projectName",
           COALESCE(p."dataClassification",'C3') AS "dataClassification",
           COALESCE(p."criticality",'silver') AS "criticality",
           COALESCE(f."cvssLocked", false) AS "cvssLocked",
           f.assets
    FROM "Finding" f
    JOIN "Project" p ON p.id = f."projectId"
    WHERE f.id = $1
  `, id);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
  }
  const f = rows[0];

  if (f.cvssLocked) {
    return NextResponse.json({
      error: 'Finding is CVSS-locked — env-aware impact rewrite is intentionally skipped.',
    }, { status: 409 });
  }

  const config = await getAIConfig();
  // Generate a fresh finding using the existing title + description + new env
  // context. We only USE the impact field from the result.
  let assetsStr = '';
  try {
    const parsed = JSON.parse(f.assets || '[]');
    assetsStr = Array.isArray(parsed) ? parsed.join('\n') : String(parsed);
  } catch { /* keep empty */ }

  const result = await generateFinding(config, {
    title: f.title,
    description: f.description,
    projectName: f.projectName,
    assets: assetsStr,
    dataClassification: f.dataClassification as 'C1'|'C2'|'C3'|'C4',
    criticality: f.criticality as 'diamond'|'silver'|'bronze'|'other',
  });

  if (!result.impact?.trim()) {
    return NextResponse.json({ error: 'AI returned no impact text' }, { status: 502 });
  }

  // Persist just the impact field — other fields stay as the user set them
  await db.finding.update({ where: { id }, data: { impact: result.impact } });

  return NextResponse.json({
    ok: true,
    impact: result.impact,
    dataClassification: f.dataClassification,
    criticality: f.criticality,
  });
}
