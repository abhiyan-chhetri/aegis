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
      assigneeId,
      cvss = 0,
      cvssVector = '',
      discovered,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Auto-generate code: F-{count+1} padded to 3 digits
    const count = await db.finding.count({ where: { projectId } });
    const code = `F-${String(count + 1).padStart(3, '0')}`;

    const finding = await db.finding.create({
      data: {
        code,
        projectId,
        title,
        severity,
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
        assigneeId: assigneeId ?? session.id,
        cvss: typeof cvss === 'number' ? cvss : parseFloat(cvss) || 0,
        cvssVector,
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
