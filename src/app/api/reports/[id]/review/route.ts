/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendWebhook } from '@/lib/webhook';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
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
    const { action, reviewerId, comment } = body as {
      action: 'submit' | 'approve' | 'reject';
      reviewerId?: string;
      comment?: string;
    };

    if (!['submit', 'approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Fetch the report with related data for webhook messages
    const report = await db.report.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        author: { select: { id: true, name: true } },
      },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    let updatedReport: any;
    let webhookText = '';

    if (action === 'submit') {
      if (!reviewerId) {
        return NextResponse.json({ error: 'reviewerId is required for submit' }, { status: 400 });
      }

      // Get reviewer name for webhook
      const reviewer = await db.user.findUnique({ where: { id: reviewerId }, select: { name: true } });

      // Update status via Prisma (status is a Prisma field)
      updatedReport = await db.report.update({
        where: { id },
        data: { status: 'in-review' },
      });

      // Update reviewerId via raw SQL (raw column)
      await db.$executeRawUnsafe(`UPDATE "Report" SET "reviewerId" = $1 WHERE id = $2`, reviewerId, id);

      // Log audit event (store reviewer name, not ID)
      await db.$executeRawUnsafe(
        `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", changes, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        uuidv4(), session.id, 'submit', 'Report', id,
        JSON.stringify({ status: 'in-review', assignedTo: reviewer?.name || reviewerId }), new Date().toISOString()
      );

      const ts = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      webhookText = `🛡️ <b>AEGIS — Report Submitted for Review</b><br><br>` +
        `📋 <b>Project:</b> ${report.project.name}<br>` +
        `✍️ <b>Author:</b> ${report.author.name}<br>` +
        `👤 <b>Assigned Reviewer:</b> ${reviewer?.name || reviewerId}<br>` +
        `🕐 <b>Submitted:</b> ${ts}<br><br>` +
        `<i>Please review the report at your earliest convenience.</i>`;

    } else if (action === 'approve') {
      // Authorisation: only the assigned reviewer may approve.
      // Empty-string reviewerId is also forbidden (orphan record).
      const reviewerCheckRows = await db.$queryRawUnsafe<{ reviewerId: string | null }[]>(
        `SELECT "reviewerId" FROM "Report" WHERE id = $1`,
        id,
      );
      const assignedReviewerId = reviewerCheckRows[0]?.reviewerId ?? null;
      if (!assignedReviewerId || assignedReviewerId !== session.id) {
        return NextResponse.json({ error: 'Only the assigned reviewer can approve this report.' }, { status: 403 });
      }
      updatedReport = await db.report.update({
        where: { id },
        data: { status: 'approved' },
      });

      // Update reviewedAt and clear reviewComment via raw SQL
      await db.$executeRawUnsafe(
        `UPDATE "Report" SET "reviewComment" = $1, "reviewedAt" = $2 WHERE id = $3`,
        comment || '',
        new Date().toISOString(),
        id
      );

      // Get reviewer name first (used in both audit log and webhook)
      const rawRows = await db.$queryRawUnsafe<{ reviewerId: string }[]>(
        `SELECT "reviewerId" FROM "Report" WHERE id = $1`, id
      );
      let reviewerName = 'reviewer';
      if (rawRows[0]?.reviewerId) {
        const reviewer = await db.user.findUnique({ where: { id: rawRows[0].reviewerId }, select: { name: true } });
        if (reviewer) reviewerName = reviewer.name;
      }

      // Log audit event (store reviewer name, not ID)
      await db.$executeRawUnsafe(
        `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", changes, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        uuidv4(), session.id, 'approve', 'Report', id,
        JSON.stringify({ status: 'approved', reviewedBy: reviewerName, comment: comment || '' }), new Date().toISOString()
      );

      const ts2 = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      webhookText = `✅ <b>AEGIS — Report Approved &amp; Finalised</b><br><br>` +
        `📋 <b>Project:</b> ${report.project.name}<br>` +
        `✍️ <b>Author:</b> ${report.author.name}<br>` +
        `✅ <b>Approved by:</b> ${reviewerName}<br>` +
        `🕐 <b>Reviewed:</b> ${ts2}<br><br>` +
        `<i>The report is now <b>final</b> and ready for delivery to the client.</i>`;

    } else if (action === 'reject') {
      // Same authorisation: only the assigned reviewer may reject.
      const reviewerCheckRows = await db.$queryRawUnsafe<{ reviewerId: string | null }[]>(
        `SELECT "reviewerId" FROM "Report" WHERE id = $1`,
        id,
      );
      const assignedReviewerId = reviewerCheckRows[0]?.reviewerId ?? null;
      if (!assignedReviewerId || assignedReviewerId !== session.id) {
        return NextResponse.json({ error: 'Only the assigned reviewer can reject this report.' }, { status: 403 });
      }
      updatedReport = await db.report.update({
        where: { id },
        data: { status: 'rejected' },
      });

      await db.$executeRawUnsafe(
        `UPDATE "Report" SET "reviewComment" = $1, "reviewedAt" = $2 WHERE id = $3`,
        comment || '',
        new Date().toISOString(),
        id
      );

      // Get reviewer name first (used in both audit log and webhook)
      const rejectRawRows = await db.$queryRawUnsafe<{ reviewerId: string }[]>(
        `SELECT "reviewerId" FROM "Report" WHERE id = $1`, id
      );
      let rejectReviewerName = 'reviewer';
      if (rejectRawRows[0]?.reviewerId) {
        const rev = await db.user.findUnique({ where: { id: rejectRawRows[0].reviewerId }, select: { name: true } });
        if (rev) rejectReviewerName = rev.name;
      }

      // Log audit event (store reviewer name, not ID)
      await db.$executeRawUnsafe(
        `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", changes, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        uuidv4(), session.id, 'reject', 'Report', id,
        JSON.stringify({ status: 'rejected', reviewedBy: rejectReviewerName, comment: comment || '' }), new Date().toISOString()
      );

      const ts3 = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const commentHtml = comment ? `<br>💬 <b>Reason:</b> <i>${comment}</i>` : '';
      webhookText = `❌ <b>AEGIS — Report Rejected</b><br><br>` +
        `📋 <b>Project:</b> ${report.project.name}<br>` +
        `✍️ <b>Author:</b> ${report.author.name}<br>` +
        `👤 <b>Rejected by:</b> ${rejectReviewerName}<br>` +
        `🕐 <b>Reviewed:</b> ${ts3}` +
        commentHtml + `<br><br>` +
        `<i>The report has been sent back for revisions.</i>`;
    }

    // Record report version snapshot AND bump the parent Report.version so
    // the /reports listing stays in sync with the history modal. Previously
    // only the ReportVersion snapshot was created, leaving Report.version
    // stuck at "v1" forever.
    if (action !== 'submit') {
      const [latestVer] = await db.$queryRawUnsafe<{ versionNumber: number }[]>(
        `SELECT "versionNumber" FROM "ReportVersion" WHERE "reportId" = $1 ORDER BY "versionNumber" DESC LIMIT 1`, id
      );
      const nextVer = (latestVer?.versionNumber || 0) + 1;
      await db.$executeRawUnsafe(
        `INSERT INTO "ReportVersion" (id, "reportId", "versionNumber", status, "approvedBy", "rejectionReason", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        uuidv4(), id, nextVer,
        action === 'approve' ? 'approved' : 'rejected',
        action === 'approve' ? session.id : null,
        comment || '',
        new Date().toISOString()
      );
      await db.report.update({
        where: { id },
        data: { version: `v${nextVer}` },
      });
    }

    // Fire webhook (fire and forget)
    if (webhookText) {
      sendWebhook(webhookText);
    }

    return NextResponse.json({ report: updatedReport, action });
  } catch (error) {
    console.error('[POST /api/reports/[id]/review]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
