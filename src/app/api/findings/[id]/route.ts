import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendWebhook } from '@/lib/webhook';
import { broadcast } from '@/lib/broadcaster';
import { v4 as uuidv4 } from 'uuid';

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

    const finding = await db.finding.findUnique({
      where: { id },
      include: {
        assignee: {
          select: { id: true, name: true, initials: true, role: true, team: true },
        },
        evidence: { orderBy: { createdAt: 'asc' } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, initials: true } },
          },
        },
        project: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    return NextResponse.json({ finding });
  } catch (error) {
    console.error('[GET /api/findings/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Get current finding to compare changes
    const currentFinding = await db.finding.findUnique({ where: { id } });
    if (!currentFinding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    const allowedFields = [
      'title', 'severity', 'status', 'summary', 'description',
      'reproduction', 'impact', 'remediation', 'references',
      'cwe', 'owasp', 'component', 'assets', 'assetOwner', 'assigneeId', 'cvss', 'cvssVector',
      'discovered', 'hasCVE',
    ];

    // If the client sent a new cvssVector, automatically apply the project's
    // environmental adjustment so the saved score / severity already reflect
    // the asset's data classification + criticality. Means manual edits stay
    // in sync with the env without needing a separate rescore.
    if (typeof body.cvssVector === 'string' && body.cvssVector.includes(':')) {
      try {
        const { ensureEnvColumns } = await import('@/lib/ensure-env-columns');
        await ensureEnvColumns().catch(() => {});
        const projRows = await db.$queryRawUnsafe<{ dataClassification: string; criticality: string }[]>(
          `SELECT COALESCE("dataClassification",'C3') AS "dataClassification",
                  COALESCE("criticality",'silver') AS "criticality"
           FROM "Project" WHERE id = $1`,
          currentFinding.projectId,
        );
        const env = projRows[0] ?? { dataClassification: 'C3', criticality: 'silver' };
        const { adjustCvss } = await import('@/lib/cvss-env');
        // Parse the incoming vector
        const parts = Object.fromEntries(
          body.cvssVector.split('/').map((p: string) => p.split(':')),
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
          // Overwrite the body's cvss + cvssVector + severity with adjusted values
          body.cvssVector = `AV:${adj.adjusted.AV}/AC:${adj.adjusted.AC}/PR:${adj.adjusted.PR}/UI:${adj.adjusted.UI}/S:${adj.adjusted.S}/C:${adj.adjusted.C}/I:${adj.adjusted.I}/A:${adj.adjusted.A}`;
          body.cvss = adj.score;
          // Only force-set severity if the client didn't already pick one.
          // If the user manually overrode severity we respect that.
          if (!('severity' in body) || body.severity === currentFinding.severity) {
            body.severity = adj.severity;
          }
        }
      } catch { /* swallow — saving uncorrected is better than failing */ }
    }

    const updateData: Record<string, unknown> = {};
    const changes: string[] = [];

    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'assets' && typeof body[field] !== 'string') {
          updateData[field] = JSON.stringify(body[field]);
          const currentAssets = JSON.stringify((currentFinding[field as keyof typeof currentFinding] as any) || '[]');
          if (currentAssets !== JSON.stringify(JSON.stringify(body[field]))) {
            changes.push('assets');
          }
        } else {
          updateData[field] = body[field];
          if (currentFinding[field as keyof typeof currentFinding] !== body[field]) {
            changes.push(field);
          }
        }
      }
    }

    const finding = await db.finding.update({
      where: { id },
      data: updateData,
      include: {
        assignee: {
          select: { id: true, name: true, initials: true, role: true },
        },
      },
    });

    // Log activity (best-effort — skip if user no longer exists in DB)
    if (changes.length > 0 && session?.id) {
      try {
        const userExists = await db.user.findUnique({ where: { id: session.id }, select: { id: true } });
        if (userExists) {
          // Determine action type based on changes
          let action = 'updated';
          let badge = 'UPDATED';
          let detail = '';

          if (changes.includes('status') && changes.length === 1) {
            action = 'status_changed';
            const newStatus = updateData.status as string;
            badge = `${newStatus.toUpperCase()}`;
            detail = `Status: ${currentFinding.status} → ${newStatus}`;
          } else if (changes.includes('assigneeId') && changes.length === 1) {
            action = 'assigned';
            badge = 'ASSIGNED';
            const newAssignee = finding.assignee?.name || 'Unassigned';
            const oldAssignee = currentFinding.assigneeId ? 'someone' : 'Unassigned';
            detail = `Reassigned to ${newAssignee}`;
          } else {
            // Multiple field changes
            const fieldLabels: Record<string, string> = {
              'reproduction': 'Reproduction',
              'description': 'Description',
              'impact': 'Impact',
              'remediation': 'Remediation',
              'references': 'References',
              'cwe': 'CWE',
              'owasp': 'OWASP',
              'cvss': 'CVSS',
              'cvssVector': 'CVSS Vector',
              'title': 'Title',
              'severity': 'Severity',
              'status': 'Status',
              'assets': 'Assets',
              'component': 'Component',
            };
            const readableChanges = changes.map(c => fieldLabels[c] || c);
            detail = `Updated: ${readableChanges.join(', ')}`;
          }

          await db.activity.create({
            data: {
              userId: session.id,
              findingId: id,
              projectId: currentFinding.projectId,
              action,
              target: finding.title,
              detail: detail || changes.join(', '),
              badge,
            },
          });
        }
      } catch (actErr) {
        console.warn('[activity log skipped]', actErr);
      }

      // Fire webhook for notable finding changes (status resolved/accepted, severity changes)
      try {
        const projectRow = await db.project.findUnique({
          where: { id: currentFinding.projectId },
          select: { name: true },
        });
        const ts = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        if (changes.includes('status') && changes.length === 1) {
          const oldStatus = currentFinding.status;
          const newStatus = updateData.status as string;
          const statusEmoji = newStatus === 'resolved' ? '✅' : newStatus === 'accepted' ? '🔵' : newStatus === 'in-progress' ? '🔄' : '📌';
          sendWebhook(
            `${statusEmoji} <b>AEGIS — Finding Status Changed</b><br><br>` +
            `🔍 <b>Finding:</b> [${finding.code}] ${finding.title}<br>` +
            `📋 <b>Project:</b> ${projectRow?.name ?? ''}<br>` +
            `🔄 <b>Status:</b> ${oldStatus} → <b>${newStatus}</b><br>` +
            `✍️ <b>Updated by:</b> ${session.name || 'Unknown'}<br>` +
            `🕐 <b>Time:</b> ${ts}`
          );
        } else if (changes.includes('severity') && changes.length === 1) {
          const oldSev = currentFinding.severity;
          const newSev = updateData.severity as string;
          const sevEmoji = newSev === 'critical' ? '🔴' : newSev === 'high' ? '🟠' : newSev === 'medium' ? '🟡' : newSev === 'low' ? '🟢' : 'ℹ️';
          sendWebhook(
            `${sevEmoji} <b>AEGIS — Finding Severity Changed</b><br><br>` +
            `🔍 <b>Finding:</b> [${finding.code}] ${finding.title}<br>` +
            `📋 <b>Project:</b> ${projectRow?.name ?? ''}<br>` +
            `⚠️ <b>Severity:</b> ${oldSev} → <b>${newSev}</b><br>` +
            `✍️ <b>Updated by:</b> ${session.name || 'Unknown'}<br>` +
            `🕐 <b>Time:</b> ${ts}`
          );
        }
      } catch (whErr) {
        console.warn('[finding webhook skipped]', whErr);
      }

      // Revert report status when a finding is changed:
      //   approved (final)  → in-review + assign random team member
      //   in-review/rejected → draft so author re-submits
      try {
        const latestReport = await db.report.findFirst({
          where: { projectId: currentFinding.projectId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true },
        });
        if (latestReport && latestReport.status !== 'draft') {
          let newStatus = 'draft';
          let newReviewerId: string | null = null;

          if (latestReport.status === 'approved') {
            newStatus = 'in-review';
            // Pick a random project team member as reviewer
            const memberRows = await db.$queryRawUnsafe<{ members: string }[]>(
              `SELECT members FROM "Project" WHERE id = $1`, currentFinding.projectId
            );
            let memberIds: string[] = [];
            try { memberIds = JSON.parse(memberRows[0]?.members ?? '[]'); } catch { /* noop */ }
            if (memberIds.length > 0) {
              newReviewerId = memberIds[Math.floor(Math.random() * memberIds.length)];
            }
          }

          await db.report.update({ where: { id: latestReport.id }, data: { status: newStatus } });
          await db.$executeRawUnsafe(
            `UPDATE "Report" SET "reviewComment" = '', "reviewedAt" = NULL, "reviewerId" = $1 WHERE id = $2`,
            newReviewerId, latestReport.id
          );
        }
      } catch (reportErr) {
        console.warn('[report revert skipped]', reportErr);
      }
    }

    // ── Broadcast finding change to SSE subscribers ───────────────────────────
    try {
      broadcast(`finding:${id}`, {
        type: 'field_update',
        fields: updateData,
        changes,
        userId: session.id,
        userName: (session as any).name || 'Someone',
        ts: Date.now(),
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ finding });
  } catch (error: unknown) {
    console.error('[PATCH /api/findings/[id]]', error);
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
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
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Grab finding info before deleting for audit log
    const finding = await db.finding.findUnique({
      where: { id },
      select: { title: true, code: true, severity: true, projectId: true },
    });

    await db.finding.delete({ where: { id } });

    // Audit log
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", changes, "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        uuidv4(), session.id, 'delete', 'Finding', id,
        JSON.stringify({ title: finding?.title, code: finding?.code, severity: finding?.severity, projectId: finding?.projectId }),
        new Date().toISOString()
      );
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[DELETE /api/findings/[id]]', error);
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
