import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendWebhook } from '@/lib/webhook';
import { broadcast } from '@/lib/broadcaster';
import { v4 as uuidv4 } from 'uuid';

// All content fields that we manage via raw SQL (bypasses Prisma schema validation entirely)
// This includes executiveSummary even though it's in the original schema — raw SQL is safer
// for fields that may be affected by our manual class.ts patch.
const CONTENT_COLS = ['executiveSummary', 'methodology', 'attackNarrative', 'members', 'assetOwners', 'notes',
  'keySecurityStrengths', 'keyAreasForImprovement', 'immediateActions', 'shortTermImprovements', 'longTermRecommendations'] as const;
type ContentCol = typeof CONTENT_COLS[number];

export async function getRawContentFields(id: string): Promise<Record<ContentCol, string>> {
  const rows = await db.$queryRawUnsafe<Record<string, string>[]>(
    `SELECT "executiveSummary", methodology, "attackNarrative", members,
            COALESCE("assetOwners", '[]') as "assetOwners",
            COALESCE(notes, '') as notes,
            COALESCE("keySecurityStrengths", '') as "keySecurityStrengths",
            COALESCE("keyAreasForImprovement", '') as "keyAreasForImprovement",
            COALESCE("immediateActions", '') as "immediateActions",
            COALESCE("shortTermImprovements", '') as "shortTermImprovements",
            COALESCE("longTermRecommendations", '') as "longTermRecommendations"
     FROM "Project" WHERE id = $1`,
    id
  );
  const row = rows[0] ?? {};
  return {
    executiveSummary: row.executiveSummary ?? '',
    methodology:      row.methodology      ?? '',
    attackNarrative:  row.attackNarrative  ?? '',
    members:          row.members          ?? '[]',
    assetOwners:      row.assetOwners      ?? '[]',
    notes:            row.notes            ?? '',
    keySecurityStrengths:      row.keySecurityStrengths      ?? '',
    keyAreasForImprovement:    row.keyAreasForImprovement    ?? '',
    immediateActions:          row.immediateActions          ?? '',
    shortTermImprovements:     row.shortTermImprovements     ?? '',
    longTermRecommendations:   row.longTermRecommendations   ?? '',
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const [project, content] = await Promise.all([
      db.project.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, initials: true, role: true, team: true, email: true } },
          findings: {
            orderBy: { createdAt: 'desc' },
            include: { assignee: { select: { id: true, name: true, initials: true } } },
          },
          reports: {
            orderBy: { createdAt: 'desc' },
            include: { author: { select: { id: true, name: true, initials: true } } },
          },
        },
      }),
      getRawContentFields(id),
    ]);

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Fetch engagement fields + siblings (other engagements with same targetCode)
    const engagementRows = await db.$queryRawUnsafe<{
      id: string; targetCode: string; engagementYear: string; previousEngagementId: string | null;
    }[]>(
      `SELECT id, COALESCE("targetCode",'') AS "targetCode", COALESCE("engagementYear",'') AS "engagementYear", "previousEngagementId" FROM "Project" WHERE id = $1`,
      id
    );
    const engRow = engagementRows[0] ?? { id, targetCode: '', engagementYear: '', previousEngagementId: null };

    let engagementSiblings: {
      id: string; code: string; name: string; status: string; engagementYear: string;
      startDate: string; endDate: string; findingCount: number; resolvedCount: number;
    }[] = [];

    if (engRow.targetCode) {
      const siblings = await db.$queryRawUnsafe<any[]>(`
        SELECT p.id, p.code, p.name, p.status,
               COALESCE(p."engagementYear",'') AS "engagementYear",
               p."startDate", p."endDate",
               COUNT(f.id) AS "findingCount",
               COUNT(CASE WHEN f.status = 'resolved' THEN 1 END) AS "resolvedCount"
        FROM "Project" p
        LEFT JOIN "Finding" f ON f."projectId" = p.id
        WHERE p."targetCode" = $1
        GROUP BY p.id, p.code, p.name, p.status, p."engagementYear", p."startDate", p."endDate"
        ORDER BY COALESCE(p."engagementYear",'') DESC, p."startDate" DESC
      `, engRow.targetCode);
      engagementSiblings = siblings.map(s => ({
        ...s,
        findingCount: Number(s.findingCount),
        resolvedCount: Number(s.resolvedCount),
        isCurrent: s.id === id,
      }));
    }

    // Previous engagement findings (carry-overs) when previousEngagementId is set
    let carryoverFindings: {
      id: string; code: string; title: string; severity: string; status: string;
    }[] = [];
    if (engRow.previousEngagementId) {
      carryoverFindings = await db.$queryRawUnsafe<any[]>(`
        SELECT id, code, title, severity, status FROM "Finding"
        WHERE "projectId" = $1 AND status NOT IN ('resolved', 'accepted')
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END
      `, engRow.previousEngagementId);
    }

    return NextResponse.json({
      project: {
        ...project, ...content,
        targetCode: engRow.targetCode,
        engagementYear: engRow.engagementYear,
        previousEngagementId: engRow.previousEngagementId,
        engagementSiblings,
        carryoverFindings,
      }
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const {
      name, status, progress, engagement, scope,
      // Content fields — handled via raw SQL
      executiveSummary, methodology, attackNarrative, members, assetOwners, notes,
      startDate, endDate, leadId,
      // Engagement fields
      targetCode, engagementYear,
      // v2.0 environmental
      dataClassification, criticality,
      // v2.2 SLA — internal vs external engagement
      engagementType,
      keySecurityStrengths, keyAreasForImprovement, immediateActions, shortTermImprovements, longTermRecommendations,
    } = body;

    // ── Prisma-managed fields (in original schema, no risk) ───────────────────
    const prismaData: Record<string, unknown> = {};
    if (name !== undefined) prismaData.name = name;
    if (status !== undefined) prismaData.status = status;
    if (progress !== undefined) prismaData.progress = progress;
    if (engagement !== undefined) prismaData.engagement = engagement;
    if (scope !== undefined)
      prismaData.scope = typeof scope === 'string' ? scope : JSON.stringify(scope);
    if (startDate !== undefined) prismaData.startDate = startDate;
    if (endDate !== undefined) prismaData.endDate = endDate;
    if (leadId !== undefined) prismaData.leadId = leadId;

    // ── Content fields — always via raw SQL ───────────────────────────────────
    const rawUpdates: { col: string; val: string }[] = [];
    if (executiveSummary !== undefined)
      rawUpdates.push({ col: 'executiveSummary', val: String(executiveSummary) });
    if (methodology !== undefined)
      rawUpdates.push({ col: 'methodology', val: String(methodology) });
    if (attackNarrative !== undefined)
      rawUpdates.push({ col: 'attackNarrative', val: String(attackNarrative) });
    if (notes !== undefined)
      rawUpdates.push({ col: 'notes', val: String(notes) });
    if (members !== undefined)
      rawUpdates.push({ col: 'members', val: Array.isArray(members) ? JSON.stringify(members) : String(members) });
    if (assetOwners !== undefined)
      rawUpdates.push({ col: 'assetOwners', val: Array.isArray(assetOwners) ? JSON.stringify(assetOwners) : String(assetOwners) });
    if (targetCode !== undefined)
      rawUpdates.push({ col: 'targetCode', val: String(targetCode) });
    if (engagementYear !== undefined)
      rawUpdates.push({ col: 'engagementYear', val: String(engagementYear) });
    if (typeof dataClassification === 'string' && /^C[1-4]$/.test(dataClassification))
      rawUpdates.push({ col: 'dataClassification', val: dataClassification });
    if (typeof criticality === 'string' && ['diamond','silver','bronze','other'].includes(criticality))
      rawUpdates.push({ col: 'criticality', val: criticality });
    if (typeof engagementType === 'string' && ['internal','external'].includes(engagementType))
      rawUpdates.push({ col: 'engagementType', val: engagementType });
    if (typeof keySecurityStrengths === 'string')
      rawUpdates.push({ col: 'keySecurityStrengths', val: keySecurityStrengths });
    if (typeof keyAreasForImprovement === 'string')
      rawUpdates.push({ col: 'keyAreasForImprovement', val: keyAreasForImprovement });
    if (typeof immediateActions === 'string')
      rawUpdates.push({ col: 'immediateActions', val: immediateActions });
    if (typeof shortTermImprovements === 'string')
      rawUpdates.push({ col: 'shortTermImprovements', val: shortTermImprovements });
    if (typeof longTermRecommendations === 'string')
      rawUpdates.push({ col: 'longTermRecommendations', val: longTermRecommendations });

    // Self-heal the env columns BEFORE the UPDATE references them — avoids
    // 42703 ("column does not exist") on installs that haven't restarted
    // the server since the v2.0 schema patch.
    if (rawUpdates.some(u => u.col === 'dataClassification' || u.col === 'criticality' || u.col === 'keySecurityStrengths' || u.col === 'keyAreasForImprovement' || u.col === 'immediateActions' || u.col === 'shortTermImprovements' || u.col === 'longTermRecommendations')) {
      try {
        const { ensureEnvColumns } = await import('@/lib/ensure-env-columns');
        await ensureEnvColumns();
      } catch { /* fall through — the UPDATE will surface the real error */ }
    }

    // Run everything in parallel
    await Promise.all([
      Object.keys(prismaData).length > 0
        ? db.project.update({ where: { id }, data: prismaData })
        : Promise.resolve(null),
      ...rawUpdates.map(({ col, val }) =>
        db.$executeRawUnsafe(`UPDATE "Project" SET "${col}" = $1 WHERE id = $2`, val, id)
      ),
    ]);

    // ── Broadcast live content changes to SSE subscribers ────────────────────
    const userName = (session as { name?: string }).name || 'Someone';
    if (notes !== undefined) {
      broadcast(`notes:${id}`, {
        type: 'content_update', field: 'notes', value: String(notes),
        userId: session.id, userName, ts: Date.now(),
      });
    }
    if (executiveSummary !== undefined) {
      broadcast(`project:${id}`, {
        type: 'content_update', field: 'executiveSummary', value: String(executiveSummary),
        userId: session.id, userName, ts: Date.now(),
      });
    }
    if (methodology !== undefined) {
      broadcast(`project:${id}`, {
        type: 'content_update', field: 'methodology', value: String(methodology),
        userId: session.id, userName, ts: Date.now(),
      });
    }
    if (attackNarrative !== undefined) {
      broadcast(`project:${id}`, {
        type: 'content_update', field: 'attackNarrative', value: String(attackNarrative),
        userId: session.id, userName, ts: Date.now(),
      });
    }

    // ── Revert report status when project content changes ────────────────────
    // approved (final) → in-review with random team member assigned as reviewer
    // in-review / rejected → draft so author re-submits
    const anythingChanged = rawUpdates.length > 0 || Object.keys(prismaData).length > 0;

    if (anythingChanged) {
      const existingReport = await db.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT id, status FROM "Report" WHERE "projectId" = $1 LIMIT 1`, id
      );
      const report = existingReport[0];
      if (report && report.status !== 'draft') {
        let newStatus = 'draft';
        let newReviewerId: string | null = null;

        if (report.status === 'approved') {
          // Report was finalised — revert to in-review and assign a random team member
          newStatus = 'in-review';
          const memberRows = await db.$queryRawUnsafe<{ members: string }[]>(
            `SELECT members FROM "Project" WHERE id = $1`, id
          );
          let memberIds: string[] = [];
          try { memberIds = JSON.parse(memberRows[0]?.members ?? '[]'); } catch { /* noop */ }
          if (memberIds.length > 0) {
            newReviewerId = memberIds[Math.floor(Math.random() * memberIds.length)];
          }
        }

        await db.report.update({ where: { id: report.id }, data: { status: newStatus } });
        await db.$executeRawUnsafe(
          `UPDATE "Report" SET "reviewComment" = '', "reviewedAt" = NULL, "reviewerId" = $1 WHERE id = $2`,
          newReviewerId, report.id
        );

        // Notify via webhook when a finalised report is reopened
        if (report.status === 'approved') {
          let reviewerName = 'a team member';
          if (newReviewerId) {
            const rev = await db.user.findUnique({ where: { id: newReviewerId }, select: { name: true } });
            if (rev) reviewerName = rev.name;
          }
          const projectRow = await db.project.findUnique({ where: { id }, select: { name: true } });
          const ts = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          sendWebhook(
            `🔄 <b>AEGIS — Finalised Report Reopened</b><br><br>` +
            `📋 <b>Project:</b> ${projectRow?.name ?? id}<br>` +
            `✏️ <b>Reason:</b> Project content was edited after approval<br>` +
            `👤 <b>Re-assigned to:</b> ${reviewerName}<br>` +
            `🕐 <b>Time:</b> ${ts}<br><br>` +
            `<i>The report has been moved back to <b>In Review</b> and needs re-approval.</i>`
          );
        }
      }
    }

    // Fetch the full updated project and content fields
    const [project, content] = await Promise.all([
      db.project.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, initials: true, role: true, team: true, email: true } },
        },
      }),
      getRawContentFields(id),
    ]);

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({ project: { ...project, ...content } });
  } catch (error: unknown) {
    console.error('[PATCH /api/projects/[id]]', error);
    if (
      typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Grab project name before deleting for the audit log
    const proj = await db.project.findUnique({ where: { id }, select: { name: true, code: true } });

    await db.project.delete({ where: { id } });

    // Audit log
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", changes, "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        uuidv4(), session.id, 'delete', 'Project', id,
        JSON.stringify({ name: proj?.name, code: proj?.code }),
        new Date().toISOString()
      );
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[DELETE /api/projects/[id]]', error);
    if (
      typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
