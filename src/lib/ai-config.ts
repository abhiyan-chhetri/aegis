/**
 * Loads the AI provider config from AppSetting (shared by the generate route
 * and the chat route).
 */
import { db } from './db';
import type { AIConfig } from './ai';

export async function getAIConfig(): Promise<AIConfig> {
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
