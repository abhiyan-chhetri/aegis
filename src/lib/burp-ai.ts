/**
 * Burp AI job processor — runs queued AI analyses in the backend. Currently:
 * JS-asset deep-reads (secrets, endpoints, internal URLs, credentials).
 * Jobs are enqueued by the ingest pipeline and processed lazily (a few per
 * ingest call + on demand from the UI), so an AI call never blocks capture.
 */
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { getAIConfig } from './ai-config';
import { analyzeJsSecrets } from './ai';
import { safeJson, SecretHit } from './burp';

export interface AnalysisJobRow {
  id: string;
  projectId: string;
  trafficId: string | null;
  kind: string;
  status: string;
  result: string;
  error: string;
}

/** Process up to `limit` pending analysis jobs for a project. */
export async function processPendingSecretJobs(projectId: string, limit = 3): Promise<{
  processed: number;
  aiSecrets: number;
  skippedNoAI: number;
}> {
  const config = await getAIConfig();
  const out = { processed: 0, aiSecrets: 0, skippedNoAI: 0 };

  const jobs = await db.$queryRawUnsafe<AnalysisJobRow[]>(
    `SELECT id, "projectId", "trafficId", kind, status, result, error
     FROM "BurpAnalysisJob"
     WHERE "projectId" = $1 AND status = 'pending'
     ORDER BY "createdAt" ASC LIMIT ${Math.max(1, limit)}`,
    projectId,
  );
  if (jobs.length === 0) return out;

  // No AI provider configured → don't burn jobs, but don't leave them
  // stuck "pending" either — mark them so the UI can explain.
  if (config.provider === 'demo') {
    for (const job of jobs) {
      await db.$executeRawUnsafe(
        `UPDATE "BurpAnalysisJob" SET status = 'failed', error = 'AI provider not configured (Settings → AI)', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        job.id,
      );
      out.skippedNoAI++;
    }
    return out;
  }

  config.usageUserId = undefined; // system processing
  config.usageFeature = 'burp-secrets-ai';

  for (const job of jobs) {
    try {
      await db.$executeRawUnsafe(
        `UPDATE "BurpAnalysisJob" SET status = 'running', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        job.id,
      );

      const traffic = job.trafficId
        ? await db.$queryRawUnsafe<Array<{ url: string; "contentType": string; "requestBody": string; "responseBody": string }>>(
            `SELECT url, "contentType", "requestBody", "responseBody" FROM "BurpTraffic" WHERE id = $1`,
            job.trafficId,
          )
        : [];
      const t = traffic[0];
      if (!t) {
        await db.$executeRawUnsafe(
          `UPDATE "BurpAnalysisJob" SET status = 'failed', error = 'traffic row gone', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
          job.id,
        );
        continue;
      }

      const jsContent = (job.kind === 'js' ? t.responseBody : `${t.requestBody}\n${t.responseBody}`) || '';
      if (jsContent.length === 0) {
        await db.$executeRawUnsafe(
          `UPDATE "BurpAnalysisJob" SET status = 'done', result = '{"note":"empty body"}', "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
          job.id,
        );
        continue;
      }

      const result = await analyzeJsSecrets(config, {
        url: t.url,
        contentType: t.contentType || '',
        jsContent: jsContent.slice(0, 120_000),
      });

      // Merge AI secrets into the traffic row's secrets column (marked source 'ai').
      let appended = 0;
      if (result.secrets.length > 0 && job.trafficId) {
        const row = await db.$queryRawUnsafe<{ secrets: string }[]>(
          `SELECT secrets FROM "BurpTraffic" WHERE id = $1`, job.trafficId,
        );
        const existing = safeJson<SecretHit[]>(row[0]?.secrets, []);
        const seen = new Set(existing.map(s => `${s.type}\u0000${s.value}`));
        for (const s of result.secrets) {
          const key = `${s.type}\u0000${s.value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          existing.push({ type: s.type, value: s.value, context: s.context, ...(s.confidence ? { confidence: s.confidence } : {}) });
          appended++;
        }
        await db.$executeRawUnsafe(`UPDATE "BurpTraffic" SET secrets = $1 WHERE id = $2`, JSON.stringify(existing), job.trafficId);
      }

      await db.$executeRawUnsafe(
        `UPDATE "BurpAnalysisJob" SET status = 'done', result = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        JSON.stringify(result), job.id,
      );
      out.processed++;
      out.aiSecrets += appended;
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 500) : 'analysis failed';
      await db.$executeRawUnsafe(
        `UPDATE "BurpAnalysisJob" SET status = 'failed', error = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        msg, job.id,
      );
    }
  }
  return out;
}

/** Queue an analysis job for a captured asset (JS bundle / error response). */
export async function enqueueAnalysisJob(projectId: string, trafficId: string, kind: 'js' | 'response'): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "BurpAnalysisJob" (id, "projectId", "trafficId", kind, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      uuidv4(), projectId, trafficId, kind,
    );
  } catch { /* non-critical */ }
}
