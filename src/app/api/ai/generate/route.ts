import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateFinding, generateSummary, type AIConfig } from '@/lib/ai';

async function getAIConfig(): Promise<AIConfig> {
  const rows = await db.$queryRawUnsafe<{ key: string; value: string }[]>(
    `SELECT key, value FROM "AppSetting" WHERE key IN ('aiProvider','aiApiKey','aiBaseUrl','aiModel','aiRegion','aiAccessKeyId','aiSecretAccessKey','aiBedrockApiKey')`
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
    bedrockApiKey: settings.aiBedrockApiKey || '',
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, context } = body as { type: 'finding' | 'summary'; context: unknown };

    if (!type || !['finding', 'summary'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type — must be "finding" or "summary"' }, { status: 400 });
    }

    const config = await getAIConfig();

    if (type === 'finding') {
      const ctx = context as Parameters<typeof generateFinding>[1];
      const result = await generateFinding(config, ctx);
      return NextResponse.json({ result, provider: config.provider });
    }

    if (type === 'summary') {
      const ctx = context as Parameters<typeof generateSummary>[1];
      const result = await generateSummary(config, ctx);
      return NextResponse.json({ result, provider: config.provider });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/ai/generate]', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
