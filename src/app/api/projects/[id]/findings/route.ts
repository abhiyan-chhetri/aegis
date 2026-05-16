import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendWebhook } from '@/lib/webhook';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const findings = await db.finding.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: {
          select: { id: true, name: true, initials: true, role: true },
        },
        evidence: true,
      },
    });

    return NextResponse.json({ findings });
  } catch (error) {
    console.error('[GET /api/projects/[id]/findings]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      severity = 'medium',
      status = 'open',
      summary = '',
      description = '',
      reproduction = '',
      impact = '',
      remediation = '',
      references = '',
      cwe = '',
      owasp = '',
      component = '',
      assets,
      assetOwner = '',
      assigneeId,
      cvss = 0,
      cvssVector = '',
      discovered,
      cvssLocked = false,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Apply project's CVSS environmental adjustment to the incoming vector so
    // the created finding's score / severity already match the asset's data
    // classification + criticality. Skip entirely if the user pinned the
    // score via cvssLocked.
    let adjustedSeverity = severity;
    let adjustedCvss = typeof cvss === 'number' ? cvss : parseFloat(cvss) || 0;
    let adjustedVector = cvssVector;
    if (!cvssLocked && typeof cvssVector === 'string' && cvssVector.includes(':')) {
      try {
        const { ensureEnvColumns } = await import('@/lib/ensure-env-columns');
        await ensureEnvColumns().catch(() => {});
        const projRows = await db.$queryRawUnsafe<{ dataClassification: string; criticality: string }[]>(
          `SELECT COALESCE("dataClassification",'C3') AS "dataClassification",
                  COALESCE("criticality",'silver') AS "criticality"
           FROM "Project" WHERE id = $1`,
          projectId,
        );
        const env = projRows[0] ?? { dataClassification: 'C3', criticality: 'silver' };
        const { adjustCvss } = await import('@/lib/cvss-env');
        const parts = Object.fromEntries(
          cvssVector.split('/').map((p: string) => p.split(':')),
        ) as Record<string, string>;
        if (parts.C && parts.I && parts.A) {
          const adj = adjustCvss(
            {
              AV: parts.AV || 'N', AC: parts.AC || 'L', PR: parts.PR || 'N',
              UI: parts.UI || 'N', S: parts.S || 'U',
              C: parts.C as 'N'|'L'|'H', I: parts.I as 'N'|'L'|'H', A: parts.A as 'N'|'L'|'H',
            },
            env.dataClassification as 'C1'|'C2'|'C3'|'C4',
            env.criticality as 'diamond'|'silver'|'bronze'|'other',
          );
          adjustedVector = `AV:${adj.adjusted.AV}/AC:${adj.adjusted.AC}/PR:${adj.adjusted.PR}/UI:${adj.adjusted.UI}/S:${adj.adjusted.S}/C:${adj.adjusted.C}/I:${adj.adjusted.I}/A:${adj.adjusted.A}`;
          adjustedCvss = adj.score;
          // Only override severity if the client didn't explicitly send one
          // matching the AI's "free choice" baseline (medium default).
          if (severity === 'medium') adjustedSeverity = adj.severity;
        }
      } catch { /* fall through with unadjusted values */ }
    }

    // Auto-generate code: F-{count+1} padded to 3 digits
    const count = await db.finding.count({ where: { projectId } });
    const code = `F-${String(count + 1).padStart(3, '0')}`;

    const finding = await db.finding.create({
      data: {
        code,
        projectId,
        title,
        severity: adjustedSeverity,
        status,
        summary,
        description,
        reproduction,
        impact,
        remediation,
        references,
        cwe,
        owasp,
        component,
        assets: typeof assets === 'string' ? assets : JSON.stringify(assets ?? []),
        assetOwner,
        assigneeId: assigneeId ?? session.id,
        cvss: adjustedCvss,
        cvssVector: adjustedVector,
        cvssLocked: !!cvssLocked,
        discovered: discovered ?? new Date().toISOString().split('T')[0],
      },
      include: {
        assignee: {
          select: { id: true, name: true, initials: true, role: true },
        },
      },
    });

    // Log activity
    if (session?.id) {
      await db.activity.create({
        data: {
          userId: session.id,
          findingId: finding.id,
          projectId,
          action: 'created',
          target: finding.title,
          detail: `[${finding.code}] ${severity.toUpperCase()} severity finding`,
          badge: 'NEW',
        },
      });
    }

    // Fire webhook (fire and forget)
    const sevEmoji = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : severity === 'low' ? '🟢' : 'ℹ️';
    const ts = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    sendWebhook(
      `${sevEmoji} <b>AEGIS — New Finding Added</b><br><br>` +
      `🔍 <b>Finding:</b> [${finding.code}] ${title}<br>` +
      `📋 <b>Project:</b> ${project.name}<br>` +
      `⚠️ <b>Severity:</b> ${severity.charAt(0).toUpperCase() + severity.slice(1)}` +
      (cvss > 0 ? ` (CVSS ${cvss})` : '') + `<br>` +
      (cwe ? `🏷️ <b>CWE:</b> ${cwe}<br>` : ``) +
      `👤 <b>Assigned to:</b> ${finding.assignee?.name || 'Unassigned'}<br>` +
      `✍️ <b>Reported by:</b> ${session.name || 'Unknown'}<br>` +
      `🕐 <b>Time:</b> ${ts}<br><br>` +
      (summary ? `<i>${summary.substring(0, 200)}${summary.length > 200 ? '…' : ''}</i>` : `<i>No summary provided.</i>`)
    );

    return NextResponse.json({ finding }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/projects/[id]/findings]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
