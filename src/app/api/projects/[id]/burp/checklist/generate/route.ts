import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getAIConfig } from '@/lib/ai-config';
import { generateBurpChecklist } from '@/lib/ai';
import { safeJson, AnomalyFlag, normalizePath } from '@/lib/burp';
import { endpointCheatCategories, cheatItemsForCategories, categoryLabel, type EndpointEvidence } from '@/lib/cheatsheet';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:id/burp/checklist/generate
 * Body: { mode: 'ai' | 'cheatsheet' | 'both' (default), endpointIds?: string[] }
 *
 * CONTEXT-AWARE ONLY: every item is grounded in real captured traffic —
 * AI proposals built from the endpoint inventory + curated cheatsheet items
 * only for categories the endpoint's actual behaviour evidences (parameters,
 * methods, content types, auth/upload/GraphQL/JS surfaces). No generic sweeps
 * ("test for .git", "check every input") and no global bucket — missing-header
 * style checks are auto-confirmed from responses instead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const mode = ['ai', 'cheatsheet', 'both'].includes(body.mode) ? body.mode : 'both';
    const endpointIds = Array.isArray(body.endpointIds) ? (body.endpointIds as string[]).slice(0, 200) : [];

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, engagement: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // ── Load endpoints + traffic-derived evidence ─────────────────────────────
    const epRows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, method, host, path, "sampleUrl", "hitCount", "statusCodes", "isJsAsset", anomalies
       FROM "BurpEndpoint"
       WHERE "projectId" = $1 ${endpointIds.length > 0 ? 'AND id = ANY($2::text[])' : ''}
       ORDER BY "hitCount" DESC LIMIT 2000`,
      ...(endpointIds.length > 0 ? [id, endpointIds] : [id]),
    );
    const endpoints = epRows.map(r => ({
      id: String(r.id),
      method: String(r.method),
      host: String(r.host),
      path: String(r.path),
      sampleUrl: String(r.sampleUrl || ''),
      hitCount: Number(r.hitCount || 0),
      statusCodes: safeJson<number[]>(String(r.statusCodes || '[]'), []),
      isJsAsset: Boolean(r.isJsAsset),
      anomalies: safeJson<AnomalyFlag[]>(String(r.anomalies || '[]'), []),
    }));

    if (endpoints.length === 0) {
      return NextResponse.json({ error: 'No endpoints captured yet — ingest some Burp traffic first.' }, { status: 400 });
    }

    // Evidence per normalized path (any method): did any request carry query
    // params / a body, and what content type did the server answer with?
    const evidenceRows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT host, "pathNoQuery", method,
              BOOL_OR(query != '') AS "hasQuery",
              BOOL_OR("requestBody" != '') AS "hasBody",
              MODE() WITHIN GROUP (ORDER BY "contentType") AS "contentType"
       FROM "BurpTraffic"
       WHERE "projectId" = $1 AND "scopeOk" = true
       GROUP BY host, "pathNoQuery", method`,
      id,
    );
    const evidenceByPath = new Map<string, { hasQuery: boolean; hasBody: boolean; contentType: string }>();
    for (const e of evidenceRows) {
      const key = `${String(e.host).toLowerCase()}\u0000${normalizePath(String(e.pathNoQuery))}`;
      const cur = evidenceByPath.get(key) ?? { hasQuery: false, hasBody: false, contentType: '' };
      cur.hasQuery = cur.hasQuery || Boolean(e.hasQuery);
      cur.hasBody = cur.hasBody || Boolean(e.hasBody);
      if (String(e.contentType || '')) cur.contentType = String(e.contentType);
      evidenceByPath.set(key, cur);
    }

    // ── Existing techniques (avoid duplicates) ───────────────────────────────
    const existingRows = await db.$queryRawUnsafe<{ technique: string; category: string; "endpointId": string | null }[]>(
      `SELECT technique, category, "endpointId" FROM "BurpChecklistItem" WHERE "projectId" = $1`,
      id,
    );
    const existingSet = new Set(existingRows.map(e => `${e.category}\u0000${e.technique}\u0000${e.endpointId || ''}`));
    const existingTechniques = existingRows.map(e => `${e.technique} (${e.endpointId ? e.category : 'general'})`).slice(0, 200);

    // ── 1. AI proposals (context-aware, endpoint-grounded) ────────────────────
    let aiProposals: Array<{ category: string; technique: string; description: string; payload: string; endpointId?: string; endpointHint?: string }> = [];
    if (mode !== 'cheatsheet') {
      const config = await getAIConfig();
      config.usageUserId = session.id;
      config.usageFeature = 'burp-checklist';
      try {
        aiProposals = await generateBurpChecklist(config, {
          projectName: project.name,
          engagement: project.engagement,
          endpoints: endpoints.map(ep => {
            const ev = evidenceByPath.get(`${ep.host.toLowerCase()}\u0000${ep.path}`);
            return {
              ...ep,
              hasQuery: ev?.hasQuery ?? false,
              hasBody: ev?.hasBody ?? false,
              contentType: ev?.contentType ?? '',
            };
          }),
          existing: existingTechniques,
        });
      } catch (e) {
        console.error('[checklist generate] AI failed, cheatsheet only:', e);
      }
    }

    // ── 2. Cheatsheet items — evidence-gated, per endpoint only ──────────────
    // No global bucket. Categories come from endpointCheatCategories(), which
    // only proposes techniques the traffic supports (params, method, content
    // type, auth/upload/GraphQL/JS surfaces, :id segments). Every item is
    // phrased as an evidence-backed suggestion ("we observed X — test Y").
    const cheatsheetProposals: Array<{ category: string; technique: string; description: string; payload: string; endpointId?: string }> = [];
    for (const ep of endpoints) {
      const evidence: EndpointEvidence = {
        method: ep.method,
        host: ep.host,
        path: ep.path,
        isJsAsset: ep.isJsAsset,
        hasQuery: evidenceByPath.get(`${ep.host.toLowerCase()}\u0000${ep.path}`)?.hasQuery ?? false,
        hasBody: evidenceByPath.get(`${ep.host.toLowerCase()}\u0000${ep.path}`)?.hasBody ?? false,
        contentType: evidenceByPath.get(`${ep.host.toLowerCase()}\u0000${ep.path}`)?.contentType ?? '',
      };
      const observed: string[] = [];
      if (ep.hitCount > 1) observed.push(`${ep.hitCount} hits`);
      if (ep.statusCodes.length > 0) observed.push(`statuses ${ep.statusCodes.slice(0, 5).join('/')}`);
      if (evidence.hasQuery) observed.push('query params seen');
      if (evidence.hasBody) observed.push('request bodies seen');
      if (evidence.contentType) observed.push(evidence.contentType);
      if (ep.anomalies.length > 0) observed.push(`flagged: ${ep.anomalies.map(a => a.label).slice(0, 3).join(', ')}`);
      const evidenceNote = observed.length > 0
        ? `We observed ${observed.join(' · ')} on ${ep.method} ${ep.host}${ep.path}.`
        : `${ep.method} ${ep.host}${ep.path} is in the captured surface.`;
      const cats = endpointCheatCategories(evidence);
      let count = 0;
      for (const cat of cats) {
        for (const it of cheatItemsForCategories([cat])) {
          if (count >= 5) break; // keep it tight — quality over volume
          cheatsheetProposals.push({
            category: it.category,
            technique: it.technique,
            description: `${evidenceNote} Suggested check: ${it.description.replace(/\.$/, '')}.`,
            payload: it.payload,
            endpointId: ep.id,
          });
          count++;
        }
      }
    }

    // ── 4. Merge + dedupe + insert ───────────────────────────────────────────
    interface Row { category: string; technique: string; description: string; payload: string; endpointId: string | null; source: string }
    const merged = new Map<string, Row>();
    const push = (r: Row) => {
      const key = `${r.category}\u0000${r.technique}\u0000${r.endpointId || ''}`;
      if (existingSet.has(key)) return;
      if (merged.has(key)) return;
      merged.set(key, r);
    };

    for (const p of aiProposals) {
      push({
        category: p.category, technique: p.technique,
        description: p.description || '', payload: p.payload || '',
        endpointId: p.endpointId || null, source: 'ai',
      });
    }
    for (const c of cheatsheetProposals) {
      push({
        category: c.category, technique: c.technique,
        description: c.description || '', payload: c.payload || '',
        endpointId: c.endpointId || null, source: 'cheatsheet',
      });
    }

    // ── 3. Living bypass playbook ────────────────────────────────────────────
    // Every FAILED attempt that got an AI bypass which later SUCCEEDED becomes
    // a proven technique — surfaced for the same category on future checklists
    // (including other engagements), so the team's own wins compound over time.
    let playbookCount = 0;
    try {
      const playbookRows = await db.$queryRawUnsafe<Array<{
        category: string; technique: string; description: string; payload: string; "projectName": string;
      }>>(
        `SELECT DISTINCT ON (ci.category, ci.technique)
                ci.category, ci.technique, ci.description, ci.payload, p.name AS "projectName"
         FROM "BurpChecklistItem" ci
         JOIN "BurpChecklistItem" parent ON parent.id = ci."parentId"
         JOIN "Project" p ON p.id = ci."projectId"
         WHERE ci.source = 'bypass' AND ci.status = 'succeeded' AND ci."parentId" IS NOT NULL
           AND ci."projectId" != $1
         ORDER BY ci.category, ci.technique, ci."updatedAt" DESC
         LIMIT 50`,
        id,
      );
      for (const b of playbookRows) {
        push({
          category: b.category,
          technique: b.technique,
          description: `⚑ PROVEN in ${b.projectName} — ${b.description || 'a bypass that worked'}`,
          payload: b.payload || '',
          endpointId: null,
          source: 'playbook',
        });
        playbookCount++;
      }
    } catch (e) {
      console.error('[checklist generate] playbook lookup failed:', e);
    }

    const finalRows = [...merged.values()].slice(0, 400);
    let order = existingRows.length;
    for (const r of finalRows) {
      await db.$executeRawUnsafe(
        `INSERT INTO "BurpChecklistItem"
           (id, "projectId", "endpointId", category, technique, description, payload,
            status, source, "order", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'untested',$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        uuidv4(), id, r.endpointId, r.category, r.technique, r.description, r.payload,
        r.source, order++,
      );
    }

    return NextResponse.json({
      created: finalRows.length,
      sources: {
        ai: aiProposals.length,
        cheatsheet: cheatsheetProposals.length,
        playbook: playbookCount,
        merged: finalRows.length,
      },
      categories: [...new Set(finalRows.map(r => categoryLabel(r.category)))],
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/burp/checklist/generate]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
