import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateFinding, generateSummary } from '@/lib/ai';
import { getAIConfig } from '@/lib/ai-config';
import { loadTrafficForAI } from '@/lib/burp';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, context } = body as {
      type: 'finding' | 'summary' | 'report-section' | 'notes-to-findings' | 'retest-scope';
      context: Record<string, unknown> & { projectId?: string };
    };

    if (!type || !['finding', 'summary', 'report-section', 'notes-to-findings', 'retest-scope'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const config = await getAIConfig();
    // Attribute this call to the user + feature in the usage ledger.
    config.usageUserId = session.id;
    config.usageFeature = type;

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

    // ── Burp traffic attachment ("matching requests" flow) ───────────────────
    // When the tester chose traffic in the picker, load the real request/
    // response pairs and feed them to the model as factual grounding.
    let trafficCtx: Record<string, unknown> = enrichedCtx;
    if (context?.projectId) {
      const trafficIds = Array.isArray(context.trafficIds)
        ? (context.trafficIds as string[]).slice(0, 20)
        : [];
      if (trafficIds.length > 0 && (type === 'notes-to-findings' || type === 'finding')) {
        try {
          const traffic = await loadTrafficForAI(String(context.projectId), trafficIds);
          if (traffic.length > 0) trafficCtx = { ...enrichedCtx, traffic };
        } catch (e) {
          console.error('[generate] traffic attach failed:', e);
        }
      }
    }

    if (type === 'finding') {
      const result = await generateFinding(config, trafficCtx as unknown as Parameters<typeof generateFinding>[1]);
      return NextResponse.json({ result, provider: config.provider });
    }

    if (type === 'notes-to-findings') {
      const { generateFindingsFromNotes } = await import('@/lib/ai');
      const result = await generateFindingsFromNotes(config, trafficCtx as unknown as Parameters<typeof generateFindingsFromNotes>[1]);
      return NextResponse.json({ findings: result, provider: config.provider });
    }

    if (type === 'retest-scope') {
      const { generateRetestScope } = await import('@/lib/ai');
      const ids = Array.isArray(context.findingIds) ? (context.findingIds as string[]).slice(0, 100) : [];
      const rows = ids.length > 0
        ? await db.finding.findMany({
            where: { id: { in: ids } },
            select: { code: true, title: true, severity: true, cwe: true, status: true, description: true, reproduction: true, impact: true, remediation: true },
          })
        : [];
      const result = await generateRetestScope(config, {
        projectName: context.projectName ? String(context.projectName) : undefined,
        engagement: context.engagement ? String(context.engagement) : undefined,
        previousEngagement: context.previousEngagement ? String(context.previousEngagement) : undefined,
        findings: rows,
      });
      return NextResponse.json({ content: result.content, provider: config.provider });
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
