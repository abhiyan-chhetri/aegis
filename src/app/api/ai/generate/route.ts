import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateFinding, generateSummary, type AIConfig } from '@/lib/ai';

async function getAIConfig(): Promise<AIConfig> {
  const rows = await db.$queryRawUnsafe<{ key: string; value: string }[]>(
    `SELECT key, value FROM "AppSetting" WHERE key IN ('aiProvider','aiApiKey','aiBaseUrl','aiModel','aiRegion','aiAccessKeyId','aiSecretAccessKey','aiBedrockApiKey','aiBedrockAuthMode')`
  );
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;

  return {
    provider: (settings.aiProvider as AIConfig['provider']) || 'demo',
    apiKey: settings.aiApiKey || '',
    baseUrl: settings.aiBaseUrl || '',
    model: settings.aiModel || '',
    region: settings.aiRegion || '',
    accessKeyId: settings.aiAccessKeyId || '',
    secretAccessKey: settings.aiSecretAccessKey || '',
    bedrockApiKey: settings.aiBedrockAuthMode === 'apikey' ? (settings.aiBedrockApiKey || '') : '',
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, context } = body as {
      type: 'finding' | 'summary' | 'report-section';
      context: Record<string, unknown> & { projectId?: string };
    };

    if (!type || !['finding', 'summary', 'report-section'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const config = await getAIConfig();

    // Look up the project's environmental settings (data class + criticality)
    // so EVERY AI call automatically gets context-aware impact wording — the
    // client doesn't have to remember to send them.
    let envContext: { dataClassification?: string; criticality?: string } = {};
    if (context?.projectId) {
      try {
        // Self-heal: ensure the columns exist before SELECTing them
        const { ensureEnvColumns } = await import('@/lib/ensure-env-columns');
        await ensureEnvColumns().catch(() => { /* keep going */ });
        const rows = await db.$queryRawUnsafe<{ dataClassification: string; criticality: string }[]>(
          `SELECT COALESCE("dataClassification", 'C3') AS "dataClassification",
                  COALESCE("criticality", 'silver') AS "criticality"
           FROM "Project" WHERE id = $1`,
          context.projectId,
        );
        if (rows[0]) envContext = rows[0];
      } catch { /* columns may not exist on very old DBs — ignore */ }
    }
    // Merge: server-fetched env overrides any client-supplied values
    const enrichedCtx = { ...context, ...envContext };

    if (type === 'finding') {
      const result = await generateFinding(config, enrichedCtx as Parameters<typeof generateFinding>[1]);
      return NextResponse.json({ result, provider: config.provider });
    }

    if (type === 'summary') {
      const result = await generateSummary(config, enrichedCtx as Parameters<typeof generateSummary>[1]);
      return NextResponse.json({ result, provider: config.provider });
    }

    if (type === 'report-section') {
      const { generateReportSection } = await import('@/lib/ai');
      const result = await generateReportSection(config, enrichedCtx as any);
      return NextResponse.json({ result, provider: config.provider });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/ai/generate]', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
